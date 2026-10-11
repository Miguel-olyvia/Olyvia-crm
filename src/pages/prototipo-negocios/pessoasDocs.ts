// Página de Pessoas: uma lista única de leads e clientes. A pessoa é uma só; lead e cliente são papéis dela.
// Funções puras: nada aqui muda o Estado. Os negócios de cada pessoa (o da seed e os de exemplo) vêm de negociosDe (negociosApp.ts).
// Quem é lead e quem é cliente decide-se aqui (a página de Leads V1 mantém a regra antiga, em leadsDocs.ts): cliente é quem tem um negócio GANHO.
import { PAPEIS, proximo, type Estado, type Negocio, type Papel, type Proximo } from "./motor";
import { FILTROS_LEAD, atrasada, filtrarLeads, idade, type FiltroLead, type Pessoa } from "./leadsDocs";
import { toquesDe } from "./toquesDocs";
import { agruparPessoas } from "./dealsPessoas";
import { extraDe, ehPessoaExemplo, type Empresa, type Qualificacao } from "./pessoasExemplo";
import { SEM_MOTIVO, motivoDaPerda } from "./perdaDocs";
import { documentosDoNegocio, ehGanho, negociosDe, valorNegocio, type DocNegocio, type NegocioApp } from "./negociosApp";

export { ehGanho } from "./negociosApp";

export type PapelPessoa = "lead" | "cliente";
export type SeparadorLista = "leads" | "clientes" | "todos";

export interface PessoaApp extends Pessoa {
  papel: PapelPessoa;
  /** Cliente com um negócio aberto que ainda não está ganho: não vira lead, fica em Clientes com "Novo negócio em curso". */
  novoNegocio: boolean;
  /** Todos os negócios da pessoa: o da seed e os de exemplo (que só existem nesta camada). Só os da seed decidem o papel. */
  todos: NegocioApp[];
  /** O motivo da perda (ou "Motivo não registado") quando todos os negócios da pessoa estão perdidos; `null` nas outras. Uma pessoa perdida é uma lead perdida. */
  perdida: string | null;
  /** MQL ou SQL: só algumas pessoas de exemplo têm. */
  qualificacao: Qualificacao | null;
  /** Quando a pessoa é uma empresa: a pessoa de contacto e o NIF. O nome da pessoa na lista é então o da empresa. */
  empresa: Empresa | null;
  /** Pessoa inventada só para a demonstração (não existe na seed). */
  exemplo: boolean;
}

/** Os chips da lista: os de lead mais "Perdidas". */
export type FiltroPessoa = FiltroLead | "perdidas";

export interface DadosCliente {
  /** Soma dos orçamentos dos negócios ganhos (contrato assinado, ou proposta aceite quando não há contrato), com o IVA. */
  valorTotal: number;
  /** Quantos negócios ganhos tem. */
  contratos: number;
  /** O negócio mais recente, o de exemplo incluído. */
  ultimo: { servico: string; quando: string } | null;
}

/** Um documento de um negócio da pessoa: orçamento, proposta, contrato, fatura ou recibo. */
export type DocPessoa = DocNegocio;

export const SEPARADORES_LISTA: { id: SeparadorLista; nome: string }[] = [
  { id: "leads", nome: "Leads" }, { id: "clientes", nome: "Clientes" }, { id: "todos", nome: "Todos" },
];

/** O comercial trabalha as leads; os outros papéis querem sobretudo os clientes. */
export function separadorPorDefeito(role: Papel): SeparadorLista {
  return role === "comercial" ? "leads" : "clientes";
}

/* ---------------------------------------------------------------- quem é quem */

/** O próximo passo de um negócio nesta página: o do motor, menos a obra (fase 5), que aqui é só "Concluído". */
export function proximoNegocio(d: Negocio, S: Estado): Proximo {
  return d.fase >= 5 ? { t: "Concluído", sub: "O negócio está pago e fechado.", done: true } : proximo(d, S);
}

/** O papel vem só dos negócios da seed (e do negócio principal das pessoas de exemplo): um negócio de exemplo extra nunca muda ninguém de lead para cliente.
 *  Quem tem todos os negócios perdidos é uma lead perdida. */
function todasAsPessoas(S: Estado): PessoaApp[] {
  return agruparPessoas(S).map(({ perdida, ...p }): PessoaApp => {
    const cliente = !perdida && p.negocios.some(ehGanho), todos = negociosDe(S, p.nome), extra = extraDe(p.nome);
    return {
      ...p, papel: cliente ? "cliente" : "lead", todos, novoNegocio: cliente && todos.some((n) => n.perdido === null && !ehGanho(n.deal)),
      perdida: perdida ? motivoDaPerda(p.nome) ?? SEM_MOTIVO : null, qualificacao: extra.qualificacao ?? null, empresa: extra.empresa ?? null, exemplo: ehPessoaExemplo(p.nome),
    };
  });
}

/** As leads por urgência (as perdidas não): atrasadas primeiro, depois as mais atrás no processo, depois as mais antigas (a mesma ordem da página de Leads). */
export function leadsApp(S: Estado): PessoaApp[] {
  return todasAsPessoas(S).filter((p) => p.papel === "lead" && p.perdida === null).map((p, i) => ({ p, i }))
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

/** As leads perdidas, pela ordem em que aparecem. */
export function perdidasApp(S: Estado): PessoaApp[] {
  return todasAsPessoas(S).filter((p) => p.perdida !== null);
}

/** Cada pessoa uma só vez: as leads, os clientes e as perdidas. */
export function todosApp(S: Estado): PessoaApp[] {
  return [...leadsApp(S), ...clientesApp(S), ...perdidasApp(S)];
}

export function pessoasDoSeparador(S: Estado, sep: SeparadorLista): PessoaApp[] {
  return sep === "leads" ? leadsApp(S) : sep === "clientes" ? clientesApp(S) : todosApp(S);
}

/** A pesquisa: nome, telefone, serviço e local. */
export function filtrarTexto<T extends Pessoa>(ps: T[], q: string): T[] {
  return filtrarLeads(ps, "todas", false, q);
}

/** Quantas pessoas tem cada separador (com a pesquisa aplicada). As perdidas só contam em Todos (em Leads vêm pelo chip Perdidas). */
export function contagens(S: Estado, q: string): Record<SeparadorLista, number> {
  const l = filtrarTexto(leadsApp(S), q).length, c = filtrarTexto(clientesApp(S), q).length, p = filtrarTexto(perdidasApp(S), q).length;
  return { leads: l, clientes: c, todos: l + c + p };
}

/* ---------------------------------------------------------------- o cliente */

export function dadosCliente(S: Estado, p: PessoaApp): DadosCliente {
  const ganhos = p.todos.filter((n) => n.perdido === null && n.orcamentos.length > 0 && ehGanho(n.deal));
  const ultimo = p.todos.filter((n) => n.perdido === null).reduce<NegocioApp | null>((a, n) => (!a || idade(n.deal.quando) < idade(a.deal.quando) ? n : a), null);
  return {
    valorTotal: ganhos.reduce((a, n) => a + (valorNegocio(n) ?? 0), 0),
    contratos: ganhos.length,
    ultimo: ultimo ? { servico: ultimo.titulo, quando: ultimo.deal.quando } : null,
  };
}

/** Os documentos dos negócios abertos da pessoa, só em leitura e derivados dos dados: os mesmos do separador Negócios (orçamentos, proposta, contrato)
 *  e, nos negócios da seed, a fatura e o recibo. Um negócio perdido não conta. */
export function documentosDe(p: PessoaApp): DocPessoa[] {
  return p.todos.filter((n) => n.perdido === null).flatMap((n): DocPessoa[] => {
    const fin = n.deal.fin, extra = (tipo: "Fatura" | "Recibo", estado: string, e: { n: string; q: string }): DocPessoa => ({
      id: `doc-${n.id}-${tipo}`, negocioId: n.negocioId, tipo, titulo: n.titulo, servico: n.titulo, estado, valor: null, referencia: e.n, data: e.q, inclui: null,
    });
    return [
      ...documentosDoNegocio(n),
      ...(fin.fatura ? [extra("Fatura", fin.pago ? "Paga" : "Emitida", fin.fatura)] : []),
      ...(fin.recibo ? [extra("Recibo", "Emitido", fin.recibo)] : []),
    ];
  });
}

/* ---------------------------------------------------------------- ordenar e filtrar a lista */

export type Ordem = "urgencia" | "recentes" | "valor";
export const ORDENS: { id: Ordem; nome: string }[] = [
  { id: "urgencia", nome: "Urgência" }, { id: "recentes", nome: "Mais recentes" }, { id: "valor", nome: "Valor" },
];

/** Os filtros da lista. `origem` e `comercial` vazios querem dizer "todos". */
export interface FiltrosPessoa { filtro: FiltroPessoa; soMinhas: boolean; q: string; origem: string; comercial: string }
export const SEM_FILTROS: FiltrosPessoa = { filtro: "todas", soMinhas: false, q: "", origem: "", comercial: "" };

/** Soma dos orçamentos dos negócios abertos da pessoa (com o IVA), os de exemplo incluídos. */
export function valorPessoa(S: Estado, p: PessoaApp): number {
  return p.todos.filter((n) => n.perdido === null).reduce((a, n) => a + (valorNegocio(n) ?? 0), 0);
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

/** A pesquisa e os filtros de leads (para os clientes só contam os que fazem sentido) e depois a origem e o comercial.
 *  "Perdidas" fica só com as perdidas; os outros filtros (menos "Todas") deixam-nas de fora. */
export function filtrarPessoas(S: Estado, ps: PessoaApp[], f: FiltrosPessoa): PessoaApp[] {
  const pool = f.filtro === "perdidas" ? ps.filter((p) => p.perdida !== null) : f.filtro === "todas" ? ps : ps.filter((p) => p.perdida === null);
  return filtrarLeads(pool, f.filtro, f.soMinhas, f.q)
    .filter((p) => !f.origem || origemDe(S, p) === f.origem)
    .filter((p) => !f.comercial || comercialDe(p) === f.comercial);
}

/** Os chips sempre à vista: nos clientes não há "por contactar". "Com visita" vive em Mais filtros (ver `filtrosEfetivos`). */
export function chipsDe(aba: SeparadorLista): { id: FiltroPessoa; nome: string }[] {
  const base = FILTROS_LEAD.filter((c) => c.id === "todas" || c.id === "atrasadas" || (c.id === "por_contactar" && aba !== "clientes"));
  return aba === "clientes" ? base : [...base, { id: "perdidas", nome: "Perdidas" }];
}

/** Os filtros que de facto se aplicam: um filtro que o separador não tem (nos clientes, "por contactar" e "com visita") volta a "Todas". */
export function filtrosEfetivos(aba: SeparadorLista, f: FiltrosPessoa): FiltrosPessoa {
  const vale = chipsDe(aba).some((c) => c.id === f.filtro) || (f.filtro === "visita" && aba !== "clientes");
  return vale ? f : { ...f, filtro: "todas" };
}

/** As pessoas entre as quais se filtra: as do separador, e as perdidas quando o filtro é "Perdidas" (as leads do separador Leads não as têm). */
export function poolDoSeparador(S: Estado, aba: SeparadorLista, filtro: FiltroPessoa): PessoaApp[] {
  return filtro === "perdidas" ? perdidasApp(S) : pessoasDoSeparador(S, aba);
}

/** A lista como se vê: o separador, a pesquisa e os filtros, pela ordem escolhida. */
export function listaVisivel(S: Estado, aba: SeparadorLista, f: FiltrosPessoa, ordem: Ordem): PessoaApp[] {
  const ef = filtrosEfetivos(aba, f);
  return ordenarPessoas(S, filtrarPessoas(S, poolDoSeparador(S, aba, ef.filtro), ef), ordem);
}
