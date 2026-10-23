// Os filtros da página Pessoas, partilhados pela lista e pelo dashboard: o que se filtra, como se aplica e como se descreve (chips).
// Funções puras: nada aqui muda o Estado. Cada pessoa é "enriquecida" uma vez (LinhaP) com o que os filtros e os gráficos precisam,
// e tudo o resto trabalha sobre essas linhas, para o dashboard e a lista contarem sempre as mesmas pessoas.
import type { Estado } from "./motor";
import { atrasada, filtrarLeads, idade } from "./leadsDocs";
import { comercialDe, dadosCliente, ordenarPessoas, origemDe, todosApp, type Ordem, type PessoaApp, type SeparadorLista } from "./pessoasDocs";
import { ehGanho, valorNegocio } from "./negociosApp";
import { perfilDe } from "./perfilDocs";
import { canalDe } from "./toquesDocs";
import { formularioDe, resultadoContacto, voltouAContactar } from "./camposPessoa";
import { ETAPAS_PESSOA, etapaPessoa } from "./listaDocs";

/** O que a coluna e o filtro de distrito dizem quando a localidade não está no mapa. */
export const SEM_DISTRITO = "Por indicar";

export type Periodo = "" | "7" | "30" | "90";
export type Qualif = "" | "MQL" | "SQL" | "sem" | "qualificada";
export type Estado3 = "" | "ativas" | "perdidas";
export type Tipo = "" | "pessoa" | "empresa";

/** Os filtros da lista e do dashboard. Texto vazio ou `false` quer dizer "sem este filtro". */
export interface FiltrosP {
  q: string;
  soMinhas: boolean;
  /** Chips rápidos (cada um liga e desliga por si). */
  porContactar: boolean;
  atrasadas: boolean;
  estado: Estado3;
  periodo: Periodo;
  origem: string;
  canal: string;
  formulario: string;
  comercial: string;
  distrito: string;
  qualificacao: Qualif;
  resultado: string;
  tipo: Tipo;
  /** Já chegou a esta etapa ("1" Contacto, "2" Visita, "3" Negócio, "4" Cliente); vazio: qualquer. */
  etapa: "" | "1" | "2" | "3" | "4";
  motivo: string;
  voltou: boolean;
  visita: boolean;
  /** Só clientes: têm um negócio novo em curso. */
  novoNegocio: boolean;
}

export const SEM_FILTROS_P: FiltrosP = {
  q: "", soMinhas: false, porContactar: false, atrasadas: false, estado: "", periodo: "", origem: "", canal: "", formulario: "", comercial: "",
  distrito: "", qualificacao: "", resultado: "", tipo: "", etapa: "", motivo: "", voltou: false, visita: false, novoNegocio: false,
};

/** Uma pessoa com tudo o que os filtros e os gráficos usam, calculado uma vez. */
export interface LinhaP {
  p: PessoaApp;
  /** Dias desde que a pessoa chegou. */
  dias: number;
  origem: string;
  canal: string;
  formulario: string;
  resultado: string;
  voltou: boolean;
  distrito: string;
  comercial: string;
  etapa: number;
  empresa: boolean;
  /** Valor dos negócios abertos que ainda não estão ganhos. */
  emJogo: number;
  /** O que o cliente já contratou (0 nas leads). */
  contratado: number;
}

const valorEmJogo = (p: PessoaApp): number =>
  p.todos.filter((n) => n.perdido === null && !ehGanho(n.deal)).reduce((a, n) => a + (valorNegocio(n) ?? 0), 0);

/** Todas as pessoas, pela ordem de todosApp (leads, clientes, perdidas). */
export function linhasDe(S: Estado): LinhaP[] {
  return todosApp(S).map((p): LinhaP => {
    const perfil = perfilDe(p, S), origem = origemDe(S, p);
    return {
      p, dias: idade(perfil.criada), origem, canal: canalDe(origem), formulario: formularioDe(S, p), resultado: resultadoContacto(perfil),
      voltou: voltouAContactar(S, p, perfil), distrito: perfil.distrito ?? SEM_DISTRITO, comercial: comercialDe(p), etapa: etapaPessoa(p),
      empresa: p.empresa !== null, emJogo: valorEmJogo(p), contratado: p.papel === "cliente" ? dadosCliente(S, p).valorTotal : 0,
    };
  });
}

/* ---------------------------------------------------------------- aplicar os filtros */

const ativa = (l: LinhaP): boolean => l.p.perdida === null;

function qualificacaoVale(l: LinhaP, f: FiltrosP): boolean {
  const q = l.p.qualificacao;
  if (f.qualificacao === "") return true;
  return f.qualificacao === "sem" ? q === null : f.qualificacao === "qualificada" ? q !== null : q === f.qualificacao;
}

/** Cada regra só reprova quando o filtro dela está ligado. Os chips "Por contactar", "Atrasadas" e "Com visita" só falam de pessoas ativas. */
const REGRAS: ReadonlyArray<(l: LinhaP, f: FiltrosP) => boolean> = [
  (l, f) => f.q.trim() === "" || filtrarLeads([l.p], "todas", false, f.q).length > 0,
  (l, f) => !f.soMinhas || l.p.negocios.some((d) => d.dono === "comercial"),
  (l, f) => !f.porContactar || (ativa(l) && l.p.principal.fase === 0),
  (l, f) => !f.atrasadas || (ativa(l) && atrasada(l.p)),
  (l, f) => !f.visita || (ativa(l) && l.p.principal.fase === 2),
  (l, f) => f.estado === "" || (f.estado === "ativas") === ativa(l),
  (l, f) => f.periodo === "" || l.dias <= Number(f.periodo),
  (l, f) => !f.origem || l.origem === f.origem,
  (l, f) => !f.canal || l.canal === f.canal,
  (l, f) => !f.formulario || l.formulario === f.formulario,
  (l, f) => !f.comercial || l.comercial === f.comercial,
  (l, f) => !f.distrito || l.distrito === f.distrito,
  qualificacaoVale,
  (l, f) => !f.resultado || l.resultado === f.resultado,
  (l, f) => f.tipo === "" || (f.tipo === "empresa") === l.empresa,
  (l, f) => f.etapa === "" || l.etapa >= Number(f.etapa),
  (l, f) => !f.motivo || l.p.perdida === f.motivo,
  (l, f) => !f.voltou || l.voltou,
  (l, f) => !f.novoNegocio || l.p.novoNegocio,
];

export const passa = (l: LinhaP, f: FiltrosP): boolean => REGRAS.every((r) => r(l, f));

/** Os filtros que de facto se aplicam: nos clientes não há "por contactar", "com visita", "voltou a contactar" nem perdidas (a lista de clientes nunca as teve). */
export function efetivos(aba: SeparadorLista, f: FiltrosP): FiltrosP {
  if (aba !== "clientes") return f;
  return { ...f, porContactar: false, visita: false, voltou: false, motivo: "", estado: f.estado === "perdidas" ? "" : f.estado };
}

/** As pessoas entre as quais se filtra: as do separador, e as perdidas quando o filtro é "Perdidas" (as leads do separador Leads não as têm). */
export function poolDe(linhas: readonly LinhaP[], aba: SeparadorLista, f: FiltrosP): LinhaP[] {
  if (aba === "todos") return [...linhas];
  if (aba === "clientes") return linhas.filter((l) => l.p.papel === "cliente");
  return linhas.filter((l) => (f.estado === "perdidas" ? !ativa(l) : l.p.papel === "lead" && ativa(l)));
}

/** As pessoas que a lista mostra para estes filtros, na ordem das linhas (a da urgência). */
export function selecionar(linhas: readonly LinhaP[], aba: SeparadorLista, f: FiltrosP): LinhaP[] {
  const ef = efetivos(aba, f);
  return poolDe(linhas, aba, ef).filter((l) => passa(l, ef));
}

/** A lista como se vê: o separador e os filtros, pela ordem escolhida. */
export function listaP(S: Estado, linhas: readonly LinhaP[], aba: SeparadorLista, f: FiltrosP, ordem: Ordem = "urgencia"): LinhaP[] {
  const sel = selecionar(linhas, aba, f);
  if (ordem === "urgencia") return sel;
  const porNome = new Map(sel.map((l) => [l.p.nome, l]));
  return ordenarPessoas(S, sel.map((l) => l.p), ordem).map((p) => porNome.get(p.nome)!);
}

/** Quantas pessoas tem cada separador com a pesquisa aplicada (as perdidas só contam em Todos). */
export function contagensP(linhas: readonly LinhaP[], q: string): Record<SeparadorLista, number> {
  const f = { ...SEM_FILTROS_P, q };
  return { leads: selecionar(linhas, "leads", f).length, clientes: selecionar(linhas, "clientes", f).length, todos: selecionar(linhas, "todos", f).length };
}

/* ---------------------------------------------------------------- chips rápidos */

export type ChipRapido = "todas" | "por_contactar" | "atrasadas" | "perdidas";

/** Os chips sempre à vista: nos clientes não há "por contactar" nem "perdidas". */
export function chipsRapidos(aba: SeparadorLista): { id: ChipRapido; nome: string }[] {
  const todos: { id: ChipRapido; nome: string }[] = [
    { id: "todas", nome: "Todas" }, { id: "por_contactar", nome: "Por contactar" }, { id: "atrasadas", nome: "Atrasadas" }, { id: "perdidas", nome: "Perdidas" },
  ];
  return aba === "clientes" ? todos.filter((c) => c.id === "todas" || c.id === "atrasadas") : todos;
}

const SEM_CHIPS: Partial<FiltrosP> = { porContactar: false, atrasadas: false, estado: "" };

export function chipAtivo(f: FiltrosP, id: ChipRapido): boolean {
  if (id === "todas") return !f.porContactar && !f.atrasadas && f.estado !== "perdidas";
  return id === "por_contactar" ? f.porContactar : id === "atrasadas" ? f.atrasadas : f.estado === "perdidas";
}

/** Ligar ou desligar um chip; "Todas" desliga os três. */
export function alternarChip(f: FiltrosP, id: ChipRapido): FiltrosP {
  if (id === "todas") return { ...f, ...SEM_CHIPS };
  if (id === "por_contactar") return { ...f, porContactar: !f.porContactar };
  if (id === "atrasadas") return { ...f, atrasadas: !f.atrasadas };
  return { ...f, estado: f.estado === "perdidas" ? "" : "perdidas" };
}

/** Quantas pessoas o chip daria: com os três chips desligados e só este ligado (o número não depende dos outros chips). */
export function contarChip(linhas: readonly LinhaP[], aba: SeparadorLista, f: FiltrosP, id: ChipRapido): number {
  const base = { ...f, ...SEM_CHIPS };
  return selecionar(linhas, aba, id === "todas" ? base : alternarChip(base, id)).length;
}

/* ---------------------------------------------------------------- chips dos filtros ativos */

export interface ChipAtivo { id: string; texto: string; limpar: Partial<FiltrosP> }

type Texto = "periodo" | "estado" | "origem" | "canal" | "formulario" | "comercial" | "distrito" | "qualificacao" | "resultado" | "tipo" | "etapa" | "motivo";
const NOME_ESTADO: Record<string, string> = { ativas: "Ativas", perdidas: "Perdidas" };
const NOME_QUALIF: Record<string, string> = { sem: "Sem", qualificada: "MQL ou SQL" };
const NOME_TIPO: Record<string, string> = { pessoa: "Pessoa", empresa: "Empresa" };

const COM_TEXTO: { chave: Texto; rotulo: string; valor: (v: string) => string }[] = [
  { chave: "periodo", rotulo: "Período", valor: (v) => `${v} dias` },
  { chave: "estado", rotulo: "Estado", valor: (v) => NOME_ESTADO[v] ?? v },
  { chave: "origem", rotulo: "Origem", valor: (v) => v },
  { chave: "canal", rotulo: "Canal", valor: (v) => v },
  { chave: "formulario", rotulo: "Formulário", valor: (v) => v },
  { chave: "comercial", rotulo: "Comercial", valor: (v) => v },
  { chave: "distrito", rotulo: "Distrito", valor: (v) => v },
  { chave: "qualificacao", rotulo: "Qualificação", valor: (v) => NOME_QUALIF[v] ?? v },
  { chave: "resultado", rotulo: "Último contacto", valor: (v) => v },
  { chave: "tipo", rotulo: "Tipo", valor: (v) => NOME_TIPO[v] ?? v },
  { chave: "etapa", rotulo: "Já chegou a", valor: (v) => ETAPAS_PESSOA[Number(v)] },
  { chave: "motivo", rotulo: "Motivo da perda", valor: (v) => v },
];
const SIM_NAO: { chave: "soMinhas" | "porContactar" | "atrasadas" | "voltou" | "visita" | "novoNegocio"; texto: string }[] = [
  { chave: "soMinhas", texto: "Só as minhas" }, { chave: "porContactar", texto: "Por contactar" }, { chave: "atrasadas", texto: "Atrasadas" },
  { chave: "voltou", texto: "Voltou a contactar" }, { chave: "visita", texto: "Com visita" }, { chave: "novoNegocio", texto: "Com negócio novo em curso" },
];

/** Cada filtro ligado, em texto, com o que o desliga. */
export function chipsAtivos(f: FiltrosP): ChipAtivo[] {
  const l: ChipAtivo[] = [];
  if (f.q.trim()) l.push({ id: "q", texto: `Pesquisa: ${f.q.trim()}`, limpar: { q: "" } });
  for (const c of COM_TEXTO) if (f[c.chave]) l.push({ id: c.chave, texto: `${c.rotulo}: ${c.valor(f[c.chave])}`, limpar: { [c.chave]: "" } });
  for (const b of SIM_NAO) if (f[b.chave]) l.push({ id: b.chave, texto: b.texto, limpar: { [b.chave]: false } });
  return l;
}

/* ---------------------------------------------------------------- opções dos selects */

const unicos = (l: string[]): string[] => [...new Set(l)].sort((a, b) => a.localeCompare(b, "pt"));

export interface OpcoesP { origem: string[]; canal: string[]; formulario: string[]; comercial: string[]; distrito: string[]; resultado: string[]; motivo: string[] }

/** As opções de cada select: o que existe nas pessoas (todas, para as opções não mudarem com o separador). */
export function opcoesDe(linhas: readonly LinhaP[]): OpcoesP {
  return {
    origem: unicos(linhas.map((l) => l.origem)), canal: unicos(linhas.map((l) => l.canal)), formulario: unicos(linhas.map((l) => l.formulario)),
    comercial: unicos(linhas.map((l) => l.comercial)), distrito: unicos(linhas.map((l) => l.distrito)), resultado: unicos(linhas.map((l) => l.resultado)),
    motivo: unicos(linhas.flatMap((l) => (l.p.perdida === null ? [] : [l.p.perdida]))),
  };
}
