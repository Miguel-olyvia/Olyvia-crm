// Lógica pura do Quadro e da Lista de "Negócio e metas": filtros, chips de vista
// rápida com contagem, ordenação, totais por fase e números do dashboard.
// Tudo calculado a partir dos negócios; nada aqui lê dados nem muda estado.
import {
  faseDoNegocio, isNegocioGanho, valorDoNegocio, type FaseNegocio, type NegocioMes,
} from "./negocioMetas";

export const FASES: readonly FaseNegocio[] = ["orcamento", "proposta", "contrato", "financeiro"];

export interface FiltrosQuadro {
  q: string;
  comercial: string;
  fase: "" | FaseNegocio;
  /** Parados há mais de 7 dias (só Orçamento e Proposta têm "parado há"). */
  parados: boolean;
  atraso: boolean;
}

export const SEM_FILTROS: FiltrosQuadro = { q: "", comercial: "", fase: "", parados: false, atraso: false };

export const LIMITE_PARADOS = 7;

/** O negócio já tem um orçamento escolhido (senão ainda não tem valor). */
export function temValor(n: NegocioMes): boolean {
  return n.orcamentos.some((o) => o.escolhido);
}

export function filtrarNegocios(negocios: readonly NegocioMes[], f: FiltrosQuadro): NegocioMes[] {
  const q = f.q.trim().toLowerCase();
  return negocios.filter((n) => {
    if (q && !`${n.pessoa} ${n.servico} ${n.comercial}`.toLowerCase().includes(q)) return false;
    if (f.comercial && n.comercial !== f.comercial) return false;
    if (f.fase && faseDoNegocio(n) !== f.fase) return false;
    if (f.parados && !(n.parado !== null && n.parado > LIMITE_PARADOS)) return false;
    if (f.atraso && !n.atraso) return false;
    return true;
  });
}

export type IdVista = "enviar" | "espera" | "assinar" | "financeiro" | "parados" | "atraso";

const VISTAS: readonly { id: IdVista; acao: Partial<FiltrosQuadro> }[] = [
  { id: "enviar", acao: { fase: "orcamento" } },
  { id: "espera", acao: { fase: "proposta" } },
  { id: "assinar", acao: { fase: "contrato" } },
  { id: "financeiro", acao: { fase: "financeiro" } },
  { id: "parados", acao: { parados: true } },
  { id: "atraso", acao: { atraso: true } },
];

export interface VistaRapida {
  id: IdVista;
  /** Linhas que o Quadro mostra depois de ligar este chip por cima dos filtros de agora. */
  n: number;
  ativo: boolean;
}

const vistaLigada = (f: FiltrosQuadro, acao: Partial<FiltrosQuadro>): boolean =>
  Object.entries(acao).every(([k, v]) => f[k as keyof FiltrosQuadro] === v);

export function vistasRapidas(negocios: readonly NegocioMes[], f: FiltrosQuadro): VistaRapida[] {
  return VISTAS.map(({ id, acao }) => ({
    id,
    n: filtrarNegocios(negocios, { ...f, ...acao }).length,
    ativo: vistaLigada(f, acao),
  }));
}

/** Liga o chip, ou desliga-o (repõe os campos dele) se já estiver ligado. */
export function alternarVista(f: FiltrosQuadro, id: IdVista): FiltrosQuadro {
  const acao = VISTAS.find((v) => v.id === id)!.acao;
  if (!vistaLigada(f, acao)) return { ...f, ...acao };
  const repor = Object.fromEntries(Object.keys(acao).map((k) => [k, SEM_FILTROS[k as keyof FiltrosQuadro]]));
  return { ...f, ...repor };
}

export const filtrosAtivos = (f: FiltrosQuadro): boolean =>
  (Object.keys(SEM_FILTROS) as (keyof FiltrosQuadro)[]).some((k) => f[k] !== SEM_FILTROS[k]);

/* ------------------------------------------------------------ próximo passo */

export type PassoKey =
  | "escolherOrcamento" | "criarProposta" | "enviarProposta" | "esperarCliente"
  | "criarContrato" | "pedirAssinatura" | "passarFinanceiro";

export function proximoPasso(n: NegocioMes): PassoKey {
  if (n.contrato) return n.contrato.estado === "assinado" ? "passarFinanceiro" : "pedirAssinatura";
  if (n.proposta) {
    if (n.proposta.estado === "rascunho") return "enviarProposta";
    return n.proposta.estado === "enviada" ? "esperarCliente" : "criarContrato";
  }
  return temValor(n) ? "criarProposta" : "escolherOrcamento";
}

/* ------------------------------------------------------------ ordenação */

export type ColunaLista = "pessoa" | "servico" | "fase" | "valor" | "parado" | "proximo" | "comercial";
export type Direcao = "asc" | "desc";
export interface Ordem { coluna: ColunaLista; dir: Direcao }

/** Direção com que cada coluna começa ao primeiro clique. */
export const DIRECAO_INICIAL: Record<ColunaLista, Direcao> = {
  pessoa: "asc", servico: "asc", fase: "asc", valor: "desc", parado: "desc", proximo: "asc", comercial: "asc",
};

type Chave = string | number | null;

function chaveDe(n: NegocioMes, c: ColunaLista): Chave {
  switch (c) {
    case "pessoa": return n.pessoa;
    case "servico": return n.servico;
    case "fase": return FASES.indexOf(faseDoNegocio(n));
    case "valor": return temValor(n) ? valorDoNegocio(n) : null;
    case "parado": return n.parado;
    case "proximo": return proximoPasso(n);
    case "comercial": return n.comercial;
  }
}

function comparar(a: Chave, b: Chave): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "pt");
}

/** Ordena por coluna; os sem valor (null) ficam sempre no fim. Sem ordem, mantém a ordem recebida. */
export function ordenarNegocios(negocios: readonly NegocioMes[], ordem: Ordem | null): NegocioMes[] {
  if (!ordem) return [...negocios];
  const sinal = ordem.dir === "asc" ? 1 : -1;
  return [...negocios].sort((x, y) => {
    const a = chaveDe(x, ordem.coluna);
    const b = chaveDe(y, ordem.coluna);
    if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
    return sinal * comparar(a, b);
  });
}

/** Um clique no cabeçalho: a mesma coluna inverte, outra começa na sua direção inicial. */
export function proximaOrdem(atual: Ordem | null, coluna: ColunaLista): Ordem {
  if (atual?.coluna === coluna) return { coluna, dir: atual.dir === "asc" ? "desc" : "asc" };
  return { coluna, dir: DIRECAO_INICIAL[coluna] };
}

/* ------------------------------------------------------------ totais */

export interface TotalFase { n: number; valor: number }

export function totaisPorFase(negocios: readonly NegocioMes[]): Record<FaseNegocio, TotalFase> {
  const totais = Object.fromEntries(FASES.map((f) => [f, { n: 0, valor: 0 }])) as Record<FaseNegocio, TotalFase>;
  for (const n of negocios) {
    const t = totais[faseDoNegocio(n)];
    t.n += 1;
    t.valor += valorDoNegocio(n);
  }
  return totais;
}

/** Probabilidade (%) de fechar, por fase, só para o "ponderado" de exemplo. */
export const PROBABILIDADE: Record<FaseNegocio, number> = { orcamento: 20, proposta: 50, contrato: 80, financeiro: 100 };

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
  const soma = (ls: readonly NegocioMes[]) => ls.reduce((s, n) => s + valorDoNegocio(n), 0);
  return [
    { chave: "quadro", valor: negocios.length, euros: false, valorNota: soma(negocios) },
    { chave: "porfechar", valor: abertos.length, euros: false, valorNota: soma(abertos) },
    { chave: "ponderado", valor: Math.round(ponderado), euros: true, valorNota: null },
    { chave: "duas", valor: negocios.filter((n) => n.orcamentos.length >= 2).length, euros: false, valorNota: null },
  ];
}
