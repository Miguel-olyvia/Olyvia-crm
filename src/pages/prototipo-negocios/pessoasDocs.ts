// Página de Pessoas: uma lista única de leads e clientes. A pessoa é uma só; lead e cliente são papéis dela.
// Funções puras: nada aqui muda o Estado. O negócio de exemplo do cliente (negociosDemo) vive só nesta camada.
import { PAPEIS, criarOrc, proximo, tot, type Estado, type Negocio, type Papel } from "./motor";
import { FILTROS_LEAD, ehLead, filtrarLeads, idade, itensNegocios, leadsDe, pessoasDe, type FiltroLead, type ItemNegocio, type Pessoa } from "./leadsDocs";
import { toquesDe } from "./toquesDocs";

export type PapelPessoa = "lead" | "cliente";
export type SeparadorLista = "leads" | "clientes" | "todos";

export interface PessoaApp extends Pessoa {
  papel: PapelPessoa;
  /** Cliente com um negócio aberto que ainda não é contrato: não vira lead, fica em Clientes com esta marca. */
  novoNegocio: boolean;
  /** Negócios de exemplo juntos só nesta camada (não existem no Estado). */
  extra: Negocio[];
}

export interface DadosCliente {
  /** Soma dos contratos (o que está assinado ou já em Financeiro ou Obra), com o IVA do orçamento. */
  valorTotal: number;
  contratos: number;
  obrasEmCurso: number;
  /** O negócio mais recente, o de exemplo incluído. */
  ultimo: { servico: string; quando: string } | null;
}

export interface DocPessoa {
  id: string;
  negocioId: number;
  tipo: "Contrato" | "Fatura" | "Recibo" | "Obra";
  servico: string;
  estado: string;
  referencia: string | null;
  data: string | null;
}

export const SEPARADORES_LISTA: { id: SeparadorLista; nome: string }[] = [
  { id: "leads", nome: "Leads" }, { id: "clientes", nome: "Clientes" }, { id: "todos", nome: "Todos" },
];

/** O comercial trabalha as leads; os outros papéis querem sobretudo os clientes. */
export function separadorPorDefeito(role: Papel): SeparadorLista {
  return role === "comercial" ? "leads" : "clientes";
}

/* ---------------------------------------------------------------- o negócio de exemplo */

const ID_DEMO = 90022;
const BASE_DEMO = 1022; // a Marta Lima, cliente (obra em curso)
const MEDIDAS_DEMO = 1031; // medidas de uma cozinha da seed, para o orçamento do negócio novo

/** Um negócio novo, aberto e em fase de orçamento, para um dos clientes da seed. Trabalha numa cópia: o Estado não muda. */
export function negociosDemo(S: Estado): Negocio[] {
  const base = S.deals.find((d) => d.id === BASE_DEMO && !d.perdido);
  const fonte = S.deals.find((d) => d.id === MEDIDAS_DEMO);
  if (!base || !fonte) return [];
  const d: Negocio = {
    ...structuredClone(base), id: ID_DEMO, linha: "coz", servico: "Cozinha nova", fase: 3, quando: "08/10", atraso: false, valida: null,
    visita: { ...structuredClone(fonte.visita), extra: {}, off: [] },
    fin: { fatura: null, pago: false, recibo: null },
    obra: { plano: null, enc: null, mats: null, real: null, aprendido: false },
    hist: [],
  };
  d.orc = criarOrc(d, S);
  return [d];
}

/* ---------------------------------------------------------------- quem é quem */

/** Já é contrato: negócio em Financeiro ou Obra, ou contrato assinado. */
export const ehContrato = (d: Negocio): boolean => d.fase >= 4 || d.orc?.contrato === "assinado";

function todasAsPessoas(S: Estado): PessoaApp[] {
  const demo = negociosDemo(S);
  return pessoasDe(S).map((p): PessoaApp => {
    const cliente = !ehLead(p);
    const extra = cliente ? demo.filter((d) => d.nome === p.nome) : [];
    return { ...p, papel: cliente ? "cliente" : "lead", extra, novoNegocio: cliente && [...p.negocios, ...extra].some((d) => !ehContrato(d)) };
  });
}

/** As leads por urgência (a mesma ordem da página de Leads). */
export function leadsApp(S: Estado): PessoaApp[] {
  const todas = todasAsPessoas(S);
  return leadsDe(S).map((p) => todas.find((x) => x.nome === p.nome)!);
}

/** Os clientes: os que pedem algo novo primeiro, depois por valor dos contratos. */
export function clientesApp(S: Estado): PessoaApp[] {
  return todasAsPessoas(S).filter((p) => p.papel === "cliente")
    .map((p, i) => ({ p, i, v: dadosCliente(S, p).valorTotal }))
    .sort((a, b) => Number(b.p.novoNegocio) - Number(a.p.novoNegocio) || b.v - a.v || a.i - b.i)
    .map((x) => x.p);
}

/** Cada pessoa uma só vez: as leads e depois os clientes. */
export function todosApp(S: Estado): PessoaApp[] {
  return [...leadsApp(S), ...clientesApp(S)];
}

export function pessoasDoSeparador(S: Estado, sep: SeparadorLista): PessoaApp[] {
  return sep === "leads" ? leadsApp(S) : sep === "clientes" ? clientesApp(S) : todosApp(S);
}

/** A pesquisa: nome, telefone, serviço e local. */
export function filtrarTexto<T extends Pessoa>(ps: T[], q: string): T[] {
  return filtrarLeads(ps, "todas", false, q);
}

/** Quantas pessoas tem cada separador (com a pesquisa aplicada). */
export function contagens(S: Estado, q: string): Record<SeparadorLista, number> {
  const l = filtrarTexto(leadsApp(S), q).length, c = filtrarTexto(clientesApp(S), q).length;
  return { leads: l, clientes: c, todos: l + c };
}

/* ---------------------------------------------------------------- o cliente */

export function dadosCliente(S: Estado, p: PessoaApp): DadosCliente {
  const contratos = p.negocios.filter((d) => d.orc && ehContrato(d));
  const ultimo = [...p.extra, ...p.negocios].reduce<Negocio | null>((a, d) => (!a || idade(d.quando) < idade(a.quando) ? d : a), null);
  return {
    valorTotal: contratos.reduce((a, d) => a + tot(d, S).pf, 0),
    contratos: contratos.length,
    obrasEmCurso: p.negocios.filter((d) => d.fase === 5 && d.obra.plano?.estado !== "concluída").length,
    ultimo: ultimo ? { servico: ultimo.servico, quando: ultimo.quando } : null,
  };
}

const maiuscula = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1);

/** Contrato, fatura, recibo e estado da obra de cada negócio do cliente, só em leitura e derivados dos dados. */
export function documentosDe(p: PessoaApp): DocPessoa[] {
  return p.negocios.flatMap((d): DocPessoa[] => {
    const o = d.orc, linhas: DocPessoa[] = [];
    const linha = (tipo: DocPessoa["tipo"], estado: string, referencia: string | null, data: string | null): void => {
      linhas.push({ id: `doc-${d.id}-${tipo}`, negocioId: d.id, tipo, servico: d.servico, estado, referencia, data });
    };
    if (o?.contrato) {
      const assinado = o.contrato === "assinado";
      const quando = d.hist.find((e) => /^contrato/i.test(e.t))?.q ?? o.aceite;
      linha("Contrato", assinado ? "Assinado" : "Enviado ao cliente", null, quando);
    }
    if (d.fin.fatura) linha("Fatura", d.fin.pago ? "Paga" : "Emitida", d.fin.fatura.n, d.fin.fatura.q);
    if (d.fin.recibo) linha("Recibo", "Emitido", d.fin.recibo.n, d.fin.recibo.q);
    if (d.obra.plano) linha("Obra", maiuscula(d.obra.plano.estado), null, null);
    return linhas;
  });
}

/** Os negócios da pessoa para o separador Negócios: o de exemplo primeiro, depois os da página de Leads. */
export function itensPessoa(S: Estado, p: PessoaApp): ItemNegocio[] {
  const demo = p.extra.map((d): ItemNegocio => ({
    id: `demo-${d.id}`, negocioId: p.principal.id, tipo: "Orçamento", servico: d.servico, valor: tot(d, S).pf, proximo: proximo(d, S).t,
    demo: true, conjunta: false, linhas: [],
  }));
  return [...demo, ...itensNegocios(S, p)];
}

/* ---------------------------------------------------------------- ordenar e filtrar a lista */

export type Ordem = "urgencia" | "recentes" | "valor";
export const ORDENS: { id: Ordem; nome: string }[] = [
  { id: "urgencia", nome: "Urgência" }, { id: "recentes", nome: "Mais recentes" }, { id: "valor", nome: "Valor" },
];

/** Os filtros da lista. `origem` e `comercial` vazios querem dizer "todos". */
export interface FiltrosPessoa { filtro: FiltroLead; soMinhas: boolean; q: string; origem: string; comercial: string }
export const SEM_FILTROS: FiltrosPessoa = { filtro: "todas", soMinhas: false, q: "", origem: "", comercial: "" };

/** Soma dos orçamentos da pessoa (com o IVA), o negócio de exemplo incluído. */
export function valorPessoa(S: Estado, p: PessoaApp): number {
  return [...p.negocios, ...p.extra].filter((d) => d.orc).reduce((a, d) => a + tot(d, S).pf, 0);
}

/** Dias desde que a pessoa chegou: o do negócio mais antigo. */
export function idadePessoa(p: PessoaApp): number {
  return p.negocios.reduce((a, d) => Math.max(a, idade(d.quando)), 0);
}

/** A origem da pessoa: a do primeiro toque. */
export function origemDe(S: Estado, p: PessoaApp): string {
  return toquesDe(S, p.nome)[0]?.origem ?? p.principal.origem;
}

export const comercialDe = (p: PessoaApp): string => PAPEIS[p.principal.dono].nome;

const unicos = (l: string[]): string[] => [...new Set(l)].sort((a, b) => a.localeCompare(b, "pt"));
export const origensDe = (S: Estado, ps: PessoaApp[]): string[] => unicos(ps.map((p) => origemDe(S, p)));
export const comerciaisDe = (ps: PessoaApp[]): string[] => unicos(ps.map(comercialDe));

/** Urgência mantém a ordem de cada lista (já vem por urgência); os outros desempatam por essa ordem. */
export function ordenarPessoas(S: Estado, ps: PessoaApp[], ordem: Ordem): PessoaApp[] {
  const itens = ps.map((p, i) => ({ p, i, v: valorPessoa(S, p), n: idadePessoa(p) }));
  if (ordem === "recentes") itens.sort((a, b) => a.n - b.n || a.i - b.i);
  else if (ordem === "valor") itens.sort((a, b) => b.v - a.v || a.i - b.i);
  return itens.map((x) => x.p);
}

/** A pesquisa e os filtros de leads (para os clientes só contam os que fazem sentido) e depois a origem e o comercial. */
export function filtrarPessoas(S: Estado, ps: PessoaApp[], f: FiltrosPessoa): PessoaApp[] {
  return filtrarLeads(ps, f.filtro, f.soMinhas, f.q)
    .filter((p) => !f.origem || origemDe(S, p) === f.origem)
    .filter((p) => !f.comercial || comercialDe(p) === f.comercial);
}

/** Os chips sempre à vista: nos clientes não há "por contactar". "Com visita" vive em Mais filtros (ver `filtrosEfetivos`). */
export function chipsDe(aba: SeparadorLista): { id: FiltroLead; nome: string }[] {
  return FILTROS_LEAD.filter((c) => c.id === "todas" || c.id === "atrasadas" || (c.id === "por_contactar" && aba !== "clientes"));
}

/** Os filtros que de facto se aplicam: um filtro que o separador não tem (nos clientes, "por contactar" e "com visita") volta a "Todas". */
export function filtrosEfetivos(aba: SeparadorLista, f: FiltrosPessoa): FiltrosPessoa {
  const vale = chipsDe(aba).some((c) => c.id === f.filtro) || (f.filtro === "visita" && aba !== "clientes");
  return vale ? f : { ...f, filtro: "todas" };
}

/** A lista como se vê: o separador, a pesquisa e os filtros, pela ordem escolhida. */
export function listaVisivel(S: Estado, aba: SeparadorLista, f: FiltrosPessoa, ordem: Ordem): PessoaApp[] {
  return ordenarPessoas(S, filtrarPessoas(S, pessoasDoSeparador(S, aba), filtrosEfetivos(aba, f)), ordem);
}

/** A pessoa que o painel mostra quando ninguém foi escolhido (no computador): a primeira da lista, a mais urgente. Sem resultados não há nenhuma. */
export function primeiraDaLista(S: Estado, aba: SeparadorLista, f: FiltrosPessoa, ordem: Ordem): PessoaApp | undefined {
  return listaVisivel(S, aba, f, ordem)[0];
}

/** O negócio a que um item do separador Negócios se refere (o de exemplo vem de `extra`). */
export function negocioDoItem(p: PessoaApp, it: ItemNegocio): Negocio | undefined {
  return it.demo ? p.extra.find((d) => `demo-${d.id}` === it.id) : p.negocios.find((d) => d.id === it.negocioId);
}
