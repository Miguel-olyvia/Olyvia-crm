// Página de Leads: quem é lead e os negócios de cada uma.
// Funções puras: nada aqui muda o Estado. Os toques (formulários e registos à mão) estão em toquesDocs.ts.
import { FASES, PAPEIS, aberto, proximo, type Estado, type Evento, type Negocio, type Proximo } from "./motor";
import { cartoesV2, docFase, type CartaoV2 } from "./negociosDocs";

/** "Hoje" do protótipo, fixo para os resultados serem sempre os mesmos. */
const REF = { dia: 10, mes: 10, ano: 2026 };

export interface Pessoa {
  nome: string;
  tel: string;
  /** Os negócios abertos desta pessoa (os perdidos não contam). */
  negocios: Negocio[];
  /** O negócio mais adiantado: é o que dá a etapa e o próximo passo da pessoa. */
  principal: Negocio;
}

export type FiltroLead = "todas" | "por_contactar" | "visita" | "atrasadas";

export interface CampoRotulado {
  rotulo: string;
  valor: string;
}

export interface ItemNegocio {
  id: string;
  negocioId: number;
  /** Orçamento, Proposta, Contrato, Financeiro, ou a etapa da pessoa (Lead, Contacto, Visita). */
  tipo: string;
  servico: string;
  valor: number | null;
  proximo: string;
  demo: boolean;
  conjunta: boolean;
  linhas: { rotulo: string; valor: number }[];
}

export interface InfoLead {
  contacto: CampoRotulado[];
  local: CampoRotulado[];
  comercial: string;
  notas: string;
}

export const FILTROS_LEAD: { id: FiltroLead; nome: string }[] = [
  { id: "todas", nome: "Todas" }, { id: "por_contactar", nome: "Por contactar" }, { id: "visita", nome: "Com visita" }, { id: "atrasadas", nome: "Atrasadas" },
];

const NOME_DOC: Record<string, string> = { orcamento: "Orçamento", proposta: "Proposta", contrato: "Contrato", financeiro: "Financeiro" };
const ETAPA_FASE: string[] = ["Por contactar", "Contactada", "Com visita", "Com orçamento"];
const TIPO_ETAPA: string[] = ["Lead", "Contacto", "Visita"];

export function localDe(d: Negocio): string {
  return d.f.localidade || d.local.split(",").pop()!.trim();
}

/** Todas as pessoas com negócios abertos, agrupadas por nome, pela ordem em que aparecem. */
export function pessoasDe(S: Estado): Pessoa[] {
  const m = new Map<string, Negocio[]>();
  for (const d of aberto(S)) m.set(d.nome, [...(m.get(d.nome) || []), d]);
  return [...m.entries()].map(([nome, negocios]) => ({
    nome, tel: negocios[0].tel, negocios,
    principal: negocios.reduce((a, d) => (d.fase > a.fase ? d : a), negocios[0]),
  }));
}

/** Lead: sem negócio em Financeiro ou Obra e sem contrato assinado. As outras pessoas são clientes. */
export function ehLead(p: Pessoa): boolean {
  return p.negocios.every((d) => d.fase < 4 && d.orc?.contrato !== "assinado");
}

/** Dias desde 1 de janeiro de 2026, para comparar datas sem fuso. */
function diaDoAno(dia: number, mes: number): number {
  return Math.round((Date.UTC(REF.ano, mes - 1, dia) - Date.UTC(REF.ano, 0, 1)) / 86400000);
}

function lerQuando(q: string): { dia: number; mes: number; hm: string } | null {
  const m = /^(\d{1,2})\/(\d{1,2})(?:\s+(\d{1,2}:\d{2}))?/.exec(q.trim());
  return m ? { dia: +m[1], mes: +m[2], hm: m[3] || "00:00" } : null;
}

/** Idade em dias da lead (para ordenar); as sem data contam como novas. */
export function idade(q: string): number {
  const t = lerQuando(q);
  return t ? diaDoAno(REF.dia, REF.mes) - diaDoAno(t.dia, t.mes) : 0;
}

/** "há 2 dias", "ontem", "hoje", "há 2 semanas"; vazio se não houver data. */
export function tempoDesde(quando: string): string {
  if (!quando) return "";
  if (quando.startsWith("hoje")) return "hoje";
  if (!lerQuando(quando)) return "";
  const n = idade(quando);
  if (n <= 0) return "hoje";
  if (n === 1) return "ontem";
  if (n < 14) return `há ${n} dias`;
  const s = Math.floor(n / 7);
  return s < 9 ? `há ${s} semanas` : `há ${Math.floor(n / 30)} meses`;
}

export function atrasada(p: Pessoa): boolean {
  return p.negocios.some((d) => !!d.atraso);
}
export function etapaDe(p: Pessoa): string {
  return ETAPA_FASE[Math.min(p.principal.fase, 3)];
}
export function proximoDe(p: Pessoa, S: Estado): Proximo {
  return proximo(p.principal, S);
}

/** As leads por urgência: atrasadas primeiro, depois as mais atrás no processo, depois as mais antigas. */
export function leadsDe(S: Estado): Pessoa[] {
  return pessoasDe(S).filter(ehLead).map((p, i) => ({ p, i }))
    .sort((a, b) =>
      Number(atrasada(b.p)) - Number(atrasada(a.p))
      || a.p.principal.fase - b.p.principal.fase
      || idade(b.p.principal.quando) - idade(a.p.principal.quando)
      || a.i - b.i)
    .map((x) => x.p);
}

export function filtrarLeads<T extends Pessoa>(ls: T[], filtro: FiltroLead | string, soMinhas: boolean, q: string): T[] {
  const ql = q.trim().toLowerCase();
  return ls.filter((p) => {
    if (ql && !(p.nome + " " + p.tel + " " + p.principal.servico + " " + localDe(p.principal)).toLowerCase().includes(ql)) return false;
    if (soMinhas && !p.negocios.some((d) => d.dono === "comercial")) return false;
    if (filtro === "por_contactar") return p.principal.fase === 0;
    if (filtro === "visita") return p.principal.fase === 2;
    if (filtro === "atrasadas") return atrasada(p);
    return true;
  });
}

/** Os negócios da pessoa: os cartões da V2 (com os de exemplo) e, para quem ainda não tem orçamento, a etapa da pessoa. */
export function itensNegocios(S: Estado, p: Pessoa): ItemNegocio[] {
  const ids = new Set(p.negocios.map((d) => d.id));
  const doc = (c: CartaoV2): ItemNegocio => ({
    id: c.id, negocioId: c.negocioId, tipo: c.conjunta ? "Proposta conjunta" : NOME_DOC[c.doc], servico: c.servico, valor: c.valor, proximo: c.proximo,
    demo: c.demo, conjunta: !!c.conjunta, linhas: c.linhas || [],
  });
  const cartoes = cartoesV2(S).filter((c) => ids.has(c.negocioId));
  const sem = p.negocios.filter((d) => !docFase(d)).map((d): ItemNegocio => ({
    id: `neg-${d.id}`, negocioId: d.id, tipo: TIPO_ETAPA[d.fase] ?? FASES[d.fase], servico: d.servico, valor: null, proximo: proximo(d, S).t,
    demo: false, conjunta: false, linhas: [],
  }));
  return [...sem, ...cartoes.map(doc)];
}

/** Soma dias a uma data "dd/mm" ou "dd/mm hh:mm"; vazio se não houver data. */
export function somarDias(q: string, n: number): string {
  const t = lerQuando(q);
  if (!t) return "";
  const x = new Date(Date.UTC(REF.ano, t.mes - 1, t.dia + n));
  const dd = String(x.getUTCDate()).padStart(2, "0"), mm = String(x.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}${t.hm !== "00:00" ? " " + t.hm : ""}`;
}

/* ---------------------------------------------------------------- informação e histórico */

const LOCAL: [string, string][] = [
  ["imovel", "Imóvel"], ["posse", "Situação"], ["tipologia", "Tipologia"], ["area_util_m2", "Área útil (m²)"], ["andar", "Andar"],
  ["tem_elevador", "Elevador"], ["acesso", "Acesso"], ["estacionamento", "Estacionamento"],
];

function par(l: [string, string | undefined][]): CampoRotulado[] {
  return l.filter((x): x is [string, string] => !!x[1]).map(([rotulo, valor]) => ({ rotulo, valor }));
}

/** Contacto, local, responsável e notas. A origem vem dos toques (toquesDocs.ts). */
export function infoLead(p: Pessoa): InfoLead {
  const d = p.principal, f = d.f;
  const morada = [f.morada, f.cp, f.localidade].filter(Boolean).join(", ");
  return {
    contacto: par([["Telefone", d.tel], ["Email", f.email], ["Consentimento (RGPD)", f.rgpd], ["Prefere", f.pref]]),
    local: [...par([["Morada", morada || d.local]]), ...par(LOCAL.map(([k, r]): [string, string | undefined] => [r, f[k]]))],
    comercial: PAPEIS[d.dono].nome,
    notas: f.pedido || "",
  };
}

/** Os eventos de todos os negócios da pessoa, pela ordem em que estão guardados (o mais recente primeiro em cada negócio). */
export function historicoDe(p: Pessoa): Evento[] {
  return p.negocios.flatMap((d) => d.hist);
}
