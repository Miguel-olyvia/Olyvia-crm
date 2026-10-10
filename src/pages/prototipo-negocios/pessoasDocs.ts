// Página de Pessoas: uma lista única de leads e clientes. A pessoa é uma só; lead e cliente são papéis dela.
// Funções puras: nada aqui muda o Estado. O negócio de exemplo do cliente (negociosDemo) vive só nesta camada.
import { criarOrc, proximo, tot, type Estado, type Negocio, type Papel } from "./motor";
import { ehLead, filtrarLeads, idade, itensNegocios, leadsDe, pessoasDe, type ItemNegocio, type Pessoa } from "./leadsDocs";

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
const ehContrato = (d: Negocio): boolean => d.fase >= 4 || d.orc?.contrato === "assinado";

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
