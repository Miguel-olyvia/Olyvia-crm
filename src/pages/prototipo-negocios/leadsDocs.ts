// Página de Leads: quem é lead, os negócios e as submissões de cada uma.
// Funções puras: nada aqui muda o Estado. As submissões são de exemplo (não existem no Estado).
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

export type EstadoSubmissao = "por_rever" | "associada" | "gerou_lead" | "revista";

export interface CampoSubmissao {
  rotulo: string;
  valor: string;
}

export interface Submissao {
  id: string;
  /** Sempre verdadeiro: estes dados não existem no protótipo. */
  exemplo: true;
  formulario: string;
  quando: string;
  estado: EstadoSubmissao;
  /** Porque não gerou lead nova (só quando não gerou). */
  motivo: string | null;
  campos: CampoSubmissao[];
  origem: string;
  utm: string;
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
  contacto: CampoSubmissao[];
  local: CampoSubmissao[];
  origem: CampoSubmissao[];
  comercial: string;
  notas: string;
}

export const ESTADO_SUBMISSAO: Record<EstadoSubmissao, string> = {
  por_rever: "Por rever", associada: "Associada à ficha", gerou_lead: "Gerou lead nova", revista: "Revista",
};

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
function idade(q: string): number {
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

export function filtrarLeads(ls: Pessoa[], filtro: FiltroLead | string, soMinhas: boolean, q: string): Pessoa[] {
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

/* ---------------------------------------------------------------- submissões de exemplo */

function formularioDe(d: Negocio): string {
  const o = d.origem.toLowerCase();
  if (o.startsWith("campanha")) return `${d.origem[0].toUpperCase()}${d.origem.slice(1)} · formulário "${d.linha === "coz" ? "Cozinha nova" : "Casa de banho nova"}"`;
  if (o === "site") return "Site · pedido de orçamento";
  if (o === "telefone") return "Pedido por telefone (registado pela equipa)";
  if (o === "recomendação") return "Recomendação (registada pela equipa)";
  return "Registo manual da equipa";
}

function utmDe(d: Negocio): string {
  const o = d.origem.toLowerCase();
  if (o.startsWith("campanha")) return "utm_source=meta · utm_medium=paid · utm_campaign=outono";
  if (o === "site") return "utm_source=google · utm_medium=organic";
  return "sem UTM (não veio de um formulário público)";
}

function camposDe(d: Negocio): CampoSubmissao[] {
  const c: CampoSubmissao[] = [{ rotulo: "Nome", valor: d.nome }, { rotulo: "Telefone", valor: d.tel }];
  const mais: [string, string | undefined][] = [
    ["Email", d.f.email], ["Localidade", localDe(d)], ["Serviço", d.servico], ["Pedido", d.f.pedido],
  ];
  for (const [rotulo, valor] of mais) if (valor) c.push({ rotulo, valor });
  return c;
}

function somarDias(q: string, n: number): string {
  const t = lerQuando(q);
  if (!t) return "";
  const x = new Date(Date.UTC(REF.ano, t.mes - 1, t.dia + n));
  const dd = String(x.getUTCDate()).padStart(2, "0"), mm = String(x.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}${t.hm !== "00:00" ? " " + t.hm : ""}`;
}

/**
 * As submissões de formulário de exemplo de uma lead, da mais antiga para a mais recente.
 * Uma por lead; quem tem mais do que um negócio tem uma segunda, associada à ficha (mostra a deduplicação).
 */
export function submissoesExemplo(S: Estado, p: Pessoa): Submissao[] {
  const d = p.negocios.reduce((a, x) => (idade(x.quando) > idade(a.quando) ? x : a), p.negocios[0]);
  const estado: EstadoSubmissao = d.fase === 0 ? "por_rever" : d.fase >= 3 ? "revista" : "gerou_lead";
  const primeira: Submissao = {
    id: `sub-${d.id}-1`, exemplo: true, formulario: formularioDe(d), quando: d.quando || "hoje", estado,
    motivo: null, campos: camposDe(d), origem: d.origem, utm: utmDe(d),
  };
  const subs = [primeira];
  if (itensNegocios(S, p).length > 1) {
    subs.push({
      id: `sub-${d.id}-2`, exemplo: true, formulario: formularioDe(d), quando: somarDias(d.quando, 2) || "hoje", estado: "associada",
      motivo: "O telefone já existia nesta ficha, por isso não criou uma lead nova.",
      campos: camposDe(d).filter((c) => c.rotulo !== "Pedido"), origem: d.origem, utm: utmDe(d),
    });
  }
  return subs;
}

/* ---------------------------------------------------------------- informação e histórico */

const LOCAL: [string, string][] = [
  ["imovel", "Imóvel"], ["posse", "Situação"], ["tipologia", "Tipologia"], ["area_util_m2", "Área útil (m²)"], ["andar", "Andar"],
  ["tem_elevador", "Elevador"], ["acesso", "Acesso"], ["estacionamento", "Estacionamento"],
];

function par(l: [string, string | undefined][]): CampoSubmissao[] {
  return l.filter((x): x is [string, string] => !!x[1]).map(([rotulo, valor]) => ({ rotulo, valor }));
}

export function infoLead(p: Pessoa): InfoLead {
  const d = p.principal, f = d.f;
  const morada = [f.morada, f.cp, f.localidade].filter(Boolean).join(", ");
  return {
    contacto: par([["Telefone", d.tel], ["Email", f.email], ["Prefere", f.pref]]),
    local: [...par([["Morada", morada || d.local]]), ...par(LOCAL.map(([k, r]): [string, string | undefined] => [r, f[k]]))],
    origem: par([["Origem", d.origem], ["Campanha ou formulário", f.campanha || formularioDe(d)]]),
    comercial: PAPEIS[d.dono].nome,
    notas: f.pedido || "",
  };
}

/** Os eventos de todos os negócios da pessoa, pela ordem em que estão guardados (o mais recente primeiro em cada negócio). */
export function historicoDe(p: Pessoa): Evento[] {
  return p.negocios.flatMap((d) => d.hist);
}
