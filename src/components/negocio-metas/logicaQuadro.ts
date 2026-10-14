// Lógica pura do Quadro e da Lista de "Negócio e metas": filtros, chips de fase
// e "Para tratar" com contagem, totais por fase e números do dashboard (a
// ordenação está em `ordenacaoQuadro.ts`). Tudo calculado a partir dos negócios
// e do dia de hoje recebido por parâmetro; nada aqui lê dados nem o relógio.
import {
  faseDoNegocio, isNegocioGanho, valorDoNegocio, type FaseNegocio, type NegocioMes,
} from "./negocioMetas";
import { precisaTratar } from "./saudeNegocio";

export const FASES: readonly FaseNegocio[] = ["orcamento", "proposta", "contrato", "ganho"];

export type FaixaValor = "" | "ate10" | "10a20" | "20mais";
export type NumOrcamentos = "" | "1" | "2+";

export interface FiltrosQuadro {
  q: string;
  /** "Os meus": só os negócios do comercial atual. */
  meus: boolean;
  comercial: string;
  /** Fases ligadas (OU entre elas); vazio = todas. */
  fases: FaseNegocio[];
  servico: string;
  orcamentos: NumOrcamentos;
  faixa: FaixaValor;
  /** "Para tratar": em atraso OU parado há mais de 7 dias OU com prazo hoje. */
  paraTratar: boolean;
}

/** Os filtros que valem só para esta visita (os outros, "Os meus" e as fases, ficam guardados). */
export type OutrosFiltros = Omit<FiltrosQuadro, "meus" | "fases">;

export const outrosFiltros = (f: FiltrosQuadro): OutrosFiltros => ({
  q: f.q, comercial: f.comercial, servico: f.servico, orcamentos: f.orcamentos, faixa: f.faixa, paraTratar: f.paraTratar,
});

export const SEM_FILTROS: FiltrosQuadro = {
  q: "", meus: false, comercial: "", fases: [], servico: "", orcamentos: "", faixa: "", paraTratar: false,
};

/** O comercial "eu" da página de exemplo (sem sessão): quem "Os meus" mostra. */
export const COMERCIAL_ATUAL = "Ana Ribeiro";

/** Limites das faixas de valor, em euros (o intervalo do meio inclui os dois extremos). */
const LIMITE_BAIXO = 10000;
const LIMITE_ALTO = 20000;

function naFaixa(n: NegocioMes, faixa: FaixaValor): boolean {
  if (!faixa) return true;
  if (!temValor(n)) return false;
  const v = valorDoNegocio(n);
  if (faixa === "ate10") return v < LIMITE_BAIXO;
  if (faixa === "20mais") return v > LIMITE_ALTO;
  return v >= LIMITE_BAIXO && v <= LIMITE_ALTO;
}

/** Os serviços que existem nos negócios, sem repetir e por ordem alfabética. */
export const servicosDe = (negocios: readonly NegocioMes[]): string[] =>
  [...new Set(negocios.map((n) => n.servico).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt"));

/** Os comerciais que existem nos negócios, sem repetir e por ordem alfabética. */
export const comerciaisDe = (negocios: readonly NegocioMes[]): string[] =>
  [...new Set(negocios.map((n) => n.comercial))].sort((a, b) => a.localeCompare(b, "pt"));

/** O negócio já tem um orçamento escolhido (senão ainda não tem valor). */
export function temValor(n: NegocioMes): boolean {
  return n.orcamentos.some((o) => o.escolhido);
}

/** Entre grupos de filtros é E; dentro das fases e dos alertas de "Para tratar" é OU. */
export function filtrarNegocios(negocios: readonly NegocioMes[], f: FiltrosQuadro, hoje: string): NegocioMes[] {
  const q = f.q.trim().toLowerCase();
  return negocios.filter((n) => {
    if (q && !`${n.pessoa} ${n.servico} ${n.comercial}`.toLowerCase().includes(q)) return false;
    if (f.meus && n.comercial !== COMERCIAL_ATUAL) return false;
    if (f.comercial && n.comercial !== f.comercial) return false;
    if (f.fases.length > 0 && !f.fases.includes(faseDoNegocio(n))) return false;
    if (f.servico && n.servico !== f.servico) return false;
    if (f.orcamentos === "1" && n.orcamentos.length !== 1) return false;
    if (f.orcamentos === "2+" && n.orcamentos.length < 2) return false;
    if (!naFaixa(n, f.faixa)) return false;
    if (f.paraTratar && !precisaTratar(n, hoje)) return false;
    return true;
  });
}

export interface ChipFase {
  fase: FaseNegocio;
  /** Negócios desta fase com os outros filtros ligados (sem o filtro de fase). */
  n: number;
  valor: number;
  ativo: boolean;
}

export interface ChipParaTratar {
  /** Negócios a tratar com os outros filtros ligados (sem o filtro de fase). */
  n: number;
  ativo: boolean;
}

/**
 * Os chips da barra: uma contagem e um valor por fase, mais "Para tratar". As
 * contagens vêm dos outros filtros e SEM o de fase, para cada chip mostrar o que
 * ganha quem o liga (as fases somam-se, OU) e a soma dos chips não mudar ao ligá-los.
 */
export function chipsDeFase(
  negocios: readonly NegocioMes[], f: FiltrosQuadro, hoje: string,
): { fases: ChipFase[]; paraTratar: ChipParaTratar } {
  const semFase = { ...f, fases: [] };
  const totais = totaisPorFase(negocios, f, hoje);
  return {
    fases: FASES.map((fase) => ({ fase, ...totais[fase], ativo: f.fases.includes(fase) })),
    paraTratar: { n: filtrarNegocios(negocios, { ...semFase, paraTratar: true }, hoje).length, ativo: f.paraTratar },
  };
}

/** Liga a fase, ou desliga-a se já estiver ligada; as outras ficam como estão. */
export function alternarFase(f: FiltrosQuadro, fase: FaseNegocio): FiltrosQuadro {
  const fases = f.fases.includes(fase) ? f.fases.filter((x) => x !== fase) : [...f.fases, fase];
  return { ...f, fases };
}

export const alternarParaTratar = (f: FiltrosQuadro): FiltrosQuadro => ({ ...f, paraTratar: !f.paraTratar });

export const filtrosAtivos = (f: FiltrosQuadro): boolean =>
  (Object.keys(SEM_FILTROS) as (keyof FiltrosQuadro)[]).some((k) =>
    k === "fases" ? f.fases.length > 0 : f[k] !== SEM_FILTROS[k]);

/** Os campos do painel Filtros que estão ligados (é o número do botão). */
export const filtrosNoPopover = (f: FiltrosQuadro): number =>
  [f.comercial, f.servico, f.orcamentos, f.faixa].filter(Boolean).length;

export type IdChip = "q" | "meus" | "comercial" | "servico" | "orcamentos" | "faixa";
export interface ChipFiltro {
  id: IdChip;
  /** O valor a mostrar (a pesquisa já sem espaços; o nome do serviço; "1" ou "2+"...). */
  valor: string;
  /** O que repor para tirar este filtro. */
  limpar: Partial<FiltrosQuadro>;
}

/** Os filtros ligados que se mostram como chip removível (as fases e "Para tratar" já se veem nos chips da barra). */
export function chipsDosFiltros(f: FiltrosQuadro): ChipFiltro[] {
  const chips: ChipFiltro[] = [];
  if (f.q.trim()) chips.push({ id: "q", valor: f.q.trim(), limpar: { q: "" } });
  if (f.meus) chips.push({ id: "meus", valor: "", limpar: { meus: false } });
  if (f.comercial) chips.push({ id: "comercial", valor: f.comercial, limpar: { comercial: "" } });
  if (f.servico) chips.push({ id: "servico", valor: f.servico, limpar: { servico: "" } });
  if (f.orcamentos) chips.push({ id: "orcamentos", valor: f.orcamentos, limpar: { orcamentos: "" } });
  if (f.faixa) chips.push({ id: "faixa", valor: f.faixa, limpar: { faixa: "" } });
  return chips;
}

/* ------------------------------------------------------------ próximo passo */

export type PassoKey =
  | "escolherOrcamento" | "criarProposta" | "enviarProposta" | "esperarCliente"
  | "criarContrato" | "pedirAssinatura" | "concluido";

export function proximoPasso(n: NegocioMes): PassoKey {
  if (n.contrato) return n.contrato.estado === "assinado" ? "concluido" : "pedirAssinatura";
  if (n.proposta) {
    if (n.proposta.estado === "rascunho") return "enviarProposta";
    return n.proposta.estado === "enviada" ? "esperarCliente" : "criarContrato";
  }
  return temValor(n) ? "criarProposta" : "escolherOrcamento";
}

/* ------------------------------------------------------------ totais */

/** Soma do valor (orçamento escolhido) dos negócios. */
export const somaValor = (negocios: readonly NegocioMes[]): number =>
  negocios.reduce((soma, n) => soma + valorDoNegocio(n), 0);

export interface TotalFase { n: number; valor: number }

/** Totais por fase dos negócios que passam nos filtros, sem contar o de fase (para o chip e a coluna de cada fase não desaparecerem). */
export function totaisPorFase(
  negocios: readonly NegocioMes[], f: FiltrosQuadro, hoje: string,
): Record<FaseNegocio, TotalFase> {
  const totais = Object.fromEntries(FASES.map((x) => [x, { n: 0, valor: 0 }])) as Record<FaseNegocio, TotalFase>;
  for (const n of filtrarNegocios(negocios, { ...f, fases: [] }, hoje)) {
    const t = totais[faseDoNegocio(n)];
    t.n += 1;
    t.valor += valorDoNegocio(n);
  }
  return totais;
}

/** Probabilidade (%) de fechar, por fase, só para o "ponderado" de exemplo. */
export const PROBABILIDADE: Record<FaseNegocio, number> = { orcamento: 20, proposta: 50, contrato: 80, ganho: 100 };

export interface ResumoQuadro {
  n: number;
  valorEmProposta: number;
  porFechar: number;
}

export function resumoQuadro(visiveis: readonly NegocioMes[]): ResumoQuadro {
  return {
    n: visiveis.length,
    valorEmProposta: visiveis
      .filter((n) => faseDoNegocio(n) === "proposta")
      .reduce((s, n) => s + valorDoNegocio(n), 0),
    porFechar: visiveis.filter((n) => !isNegocioGanho(n)).length,
  };
}

export type ChaveNumero = "quadro" | "porfechar" | "ponderado" | "duas";
export interface NumeroDashboard {
  chave: ChaveNumero;
  valor: number;
  euros: boolean;
  /** Valor em euros dos negócios contados (nota do cartão); `null` quando não se aplica. */
  valorNota: number | null;
}

/** Os números do dashboard: no quadro, por fechar, ponderado e com 2+ orçamentos. */
export function numerosDashboard(negocios: readonly NegocioMes[]): NumeroDashboard[] {
  const abertos = negocios.filter((n) => !isNegocioGanho(n));
  const ponderado = abertos.reduce(
    (s, n) => s + (valorDoNegocio(n) * PROBABILIDADE[faseDoNegocio(n)]) / 100,
    0,
  );
  return [
    { chave: "quadro", valor: negocios.length, euros: false, valorNota: somaValor(negocios) },
    { chave: "porfechar", valor: abertos.length, euros: false, valorNota: somaValor(abertos) },
    { chave: "ponderado", valor: Math.round(ponderado), euros: true, valorNota: null },
    { chave: "duas", valor: negocios.filter((n) => n.orcamentos.length >= 2).length, euros: false, valorNota: null },
  ];
}
