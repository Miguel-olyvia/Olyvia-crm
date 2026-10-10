// Página de Pessoas: uma lista única de leads e clientes. A pessoa é uma só; lead e cliente são papéis dela.
// Funções puras: nada aqui muda o Estado. O negócio de exemplo do cliente (negociosDemo) vive só nesta camada.
// Quem é lead e quem é cliente decide-se aqui (a página de Leads V1 mantém a regra antiga, em leadsDocs.ts): cliente é quem tem um negócio GANHO.
import { PAPEIS, criarOrc, proximo, tot, type Estado, type Negocio, type Papel, type Proximo } from "./motor";
import { FILTROS_LEAD, atrasada, filtrarLeads, idade, itensNegocios, pessoasDe, type FiltroLead, type ItemNegocio, type Pessoa } from "./leadsDocs";
import { toquesDe } from "./toquesDocs";

export type PapelPessoa = "lead" | "cliente";
export type SeparadorLista = "leads" | "clientes" | "todos";

export interface PessoaApp extends Pessoa {
  papel: PapelPessoa;
  /** Cliente com um negócio aberto que ainda não está ganho: não vira lead, fica em Clientes com "Novo negócio em curso". */
  novoNegocio: boolean;
  /** Negócios de exemplo juntos só nesta camada (não existem no Estado). */
  extra: Negocio[];
}

export interface DadosCliente {
  /** Soma dos negócios ganhos (contrato assinado, ou proposta aceite quando não há contrato), com o IVA do orçamento. */
  valorTotal: number;
  /** Quantos negócios ganhos tem. */
  contratos: number;
  /** O negócio mais recente, o de exemplo incluído. */
  ultimo: { servico: string; quando: string } | null;
}

export interface DocPessoa {
  id: string;
  negocioId: number;
  tipo: "Contrato" | "Fatura" | "Recibo";
  servico: string;
  estado: string;
  referencia: string | null;
  data: string | null;
}

/** As etapas de uma pessoa que ainda não tem documentos. */
export const ETAPAS_PREPARACAO: readonly string[] = ["Lead", "Contacto", "Visita"];

export const SEPARADORES_LISTA: { id: SeparadorLista; nome: string }[] = [
  { id: "leads", nome: "Leads" }, { id: "clientes", nome: "Clientes" }, { id: "todos", nome: "Todos" },
];

/** O comercial trabalha as leads; os outros papéis querem sobretudo os clientes. */
export function separadorPorDefeito(role: Papel): SeparadorLista {
  return role === "comercial" ? "leads" : "clientes";
}

/* ---------------------------------------------------------------- o negócio de exemplo */

const ID_DEMO = 90022;
const BASE_DEMO = 1022; // a Marta Lima, cliente
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

/** Negócio GANHO: o contrato assinado; ou, quando o negócio não exige contrato (venda direta, só proposta), a proposta aceite.
 *  Financeiro e Obra (fases 4 e 5) já passaram pelo ganho. Um negócio perdido nunca está ganho. A pessoa vira cliente com o primeiro. */
export function ehGanho(d: Negocio): boolean {
  if (d.perdido) return false;
  const o = d.orc;
  return d.fase >= 4 || o?.contrato === "assinado" || (!!o?.vendaDireta && !!o.aceite);
}

/** O próximo passo de um negócio nesta página: o do motor, menos a obra (fase 5), que aqui é só "Concluído". */
export function proximoNegocio(d: Negocio, S: Estado): Proximo {
  return d.fase >= 5 ? { t: "Concluído", sub: "O negócio está pago e fechado.", done: true } : proximo(d, S);
}

function todasAsPessoas(S: Estado): PessoaApp[] {
  const demo = negociosDemo(S);
  return pessoasDe(S).map((p): PessoaApp => {
    const cliente = p.negocios.some(ehGanho);
    const extra = cliente ? demo.filter((d) => d.nome === p.nome) : [];
    return { ...p, papel: cliente ? "cliente" : "lead", extra, novoNegocio: cliente && [...p.negocios, ...extra].some((d) => !ehGanho(d)) };
  });
}

/** As leads por urgência: atrasadas primeiro, depois as mais atrás no processo, depois as mais antigas (a mesma ordem da página de Leads). */
export function leadsApp(S: Estado): PessoaApp[] {
  return todasAsPessoas(S).filter((p) => p.papel === "lead").map((p, i) => ({ p, i }))
    .sort((a, b) =>
      Number(atrasada(b.p)) - Number(atrasada(a.p))
      || a.p.principal.fase - b.p.principal.fase
      || idade(b.p.principal.quando) - idade(a.p.principal.quando)
      || a.i - b.i)
    .map((x) => x.p);
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
  const contratos = p.negocios.filter((d) => d.orc && ehGanho(d));
  const ultimo = [...p.extra, ...p.negocios].reduce<Negocio | null>((a, d) => (!a || idade(d.quando) < idade(a.quando) ? d : a), null);
  return {
    valorTotal: contratos.reduce((a, d) => a + tot(d, S).pf, 0),
    contratos: contratos.length,
    ultimo: ultimo ? { servico: ultimo.servico, quando: ultimo.quando } : null,
  };
}

/** Contrato, fatura e recibo de cada negócio do cliente, só em leitura e derivados dos dados. */
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
    return linhas;
  });
}

/** A página de Leads dá ao negócio da fase 5 o tipo "Obra" e nenhum valor; aqui é um Financeiro já fechado, com o seu valor. */
function semObra(S: Estado, p: PessoaApp, it: ItemNegocio): ItemNegocio {
  const d = p.negocios.find((x) => x.id === it.negocioId);
  if (it.tipo !== "Obra" || !d) return it;
  return { ...it, tipo: "Financeiro", valor: d.orc ? tot(d, S).pf : null, proximo: proximoNegocio(d, S).t };
}

/** Os negócios da pessoa para o separador Negócios: o de exemplo primeiro, depois os da página de Leads. */
export function itensPessoa(S: Estado, p: PessoaApp): ItemNegocio[] {
  const demo = p.extra.map((d): ItemNegocio => ({
    id: `demo-${d.id}`, negocioId: p.principal.id, tipo: "Orçamento", servico: d.servico, valor: tot(d, S).pf, proximo: proximo(d, S).t,
    demo: true, conjunta: false, linhas: [],
  }));
  return [...demo, ...itensNegocios(S, p).map((it) => semObra(S, p, it))];
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

/** Um negócio da pessoa com os documentos dele. `negocio` fica por definir quando os itens apontam para um negócio que a pessoa não tem. */
export interface GrupoNegocio { chave: string; negocio: Negocio | undefined; principal: ItemNegocio; docs: ItemNegocio[] }

/** Agrupa os itens por negócio, pela ordem em que cada negócio aparece. Os cartões de exemplo da V2 (proposta conjunta, segundo orçamento)
 *  apontam para o negócio base da pessoa e juntam-se a ele. `docs` são só os documentos (sem as etapas de preparação); `principal` é o primeiro, ou a etapa quando ainda não há. */
export function negociosAgrupados(p: PessoaApp, itens: ItemNegocio[]): GrupoNegocio[] {
  const grupos = new Map<string, { negocio: Negocio | undefined; itens: ItemNegocio[] }>();
  for (const it of itens) {
    const d = negocioDoItem(p, it) ?? p.negocios.find((x) => x.id === it.negocioId);
    const chave = d ? `n${d.id}` : `x${it.negocioId}`;
    const g = grupos.get(chave);
    if (g) g.itens.push(it); else grupos.set(chave, { negocio: d, itens: [it] });
  }
  return [...grupos].map(([chave, g]) => {
    const docs = g.itens.filter((it) => !ETAPAS_PREPARACAO.includes(it.tipo));
    return { chave, negocio: g.negocio, principal: docs[0] ?? g.itens[0], docs };
  });
}

/** O negócio a que um item do separador Negócios se refere (o de exemplo vem de `extra`). */
export function negocioDoItem(p: PessoaApp, it: ItemNegocio): Negocio | undefined {
  return it.demo ? p.extra.find((d) => `demo-${d.id}` === it.id) : p.negocios.find((d) => d.id === it.negocioId);
}
