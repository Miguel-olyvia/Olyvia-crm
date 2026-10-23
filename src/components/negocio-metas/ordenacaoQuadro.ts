// Ordenação do Quadro e da Lista de "Negócio e metas". Uma só ordem, partilhada
// pelo select "Ordenar" e pelos cabeçalhos da Lista. Sem ordem escolhida
// (`null`) vale a urgência: o que está pior primeiro, e dentro de cada grau o
// prazo mais próximo. Recebe sempre o dia de hoje; nunca lê o relógio.
import { FASES, temValor } from "./logicaQuadro";
import { faseDoNegocio, valorDoNegocio, type NegocioMes } from "./negocioMetas";
import { ORDEM_SAUDE, saudeDoNegocio } from "./saudeNegocio";

export type ColunaLista = "pessoa" | "fase" | "valor" | "parado" | "prazo" | "saude" | "comercial";
export type Direcao = "asc" | "desc";
export interface Ordem { coluna: ColunaLista; dir: Direcao }

/** Valor do select "Ordenar": a urgência (ordem por defeito) ou uma coluna. */
export type OrdemSelect = "urgencia" | ColunaLista;
export const ORDENS_SELECT: readonly OrdemSelect[] = [
  "urgencia", "prazo", "saude", "valor", "parado", "pessoa", "fase", "comercial",
];

/** Direção com que cada coluna começa ao primeiro clique. */
export const DIRECAO_INICIAL: Record<ColunaLista, Direcao> = {
  pessoa: "asc", fase: "asc", valor: "desc", parado: "desc", prazo: "asc", saude: "asc", comercial: "asc",
};

type Chave = string | number | null;

function chaveDe(n: NegocioMes, c: ColunaLista, hoje: string): Chave {
  switch (c) {
    case "pessoa": return n.pessoa;
    case "fase": return FASES.indexOf(faseDoNegocio(n));
    case "valor": return temValor(n) ? valorDoNegocio(n) : null;
    case "parado": return n.parado;
    case "prazo": return n.proximoPrazo;
    case "saude": return ORDEM_SAUDE.indexOf(saudeDoNegocio(n, hoje));
    case "comercial": return n.comercial;
  }
}

function comparar(a: Chave, b: Chave): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "pt");
}

/** Compara duas chaves com os vazios (null) sempre no fim, qualquer que seja a direção. */
function compararComVazios(a: Chave, b: Chave, sinal: 1 | -1): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
  return sinal * comparar(a, b);
}

function porUrgencia(x: NegocioMes, y: NegocioMes, hoje: string): number {
  const grau = comparar(chaveDe(x, "saude", hoje), chaveDe(y, "saude", hoje));
  return grau !== 0 ? grau : compararComVazios(x.proximoPrazo, y.proximoPrazo, 1);
}

/** Ordena sem alterar a lista recebida; empates mantêm a ordem recebida. */
export function ordenarNegocios(negocios: readonly NegocioMes[], ordem: Ordem | null, hoje: string): NegocioMes[] {
  if (!ordem) return [...negocios].sort((x, y) => porUrgencia(x, y, hoje));
  const sinal = ordem.dir === "asc" ? 1 : -1;
  return [...negocios].sort((x, y) =>
    compararComVazios(chaveDe(x, ordem.coluna, hoje), chaveDe(y, ordem.coluna, hoje), sinal));
}

/** Um clique no cabeçalho: a mesma coluna inverte, outra começa na sua direção inicial. */
export function proximaOrdem(atual: Ordem | null, coluna: ColunaLista): Ordem {
  if (atual?.coluna === coluna) return { coluna, dir: atual.dir === "asc" ? "desc" : "asc" };
  return { coluna, dir: DIRECAO_INICIAL[coluna] };
}

/** A escolha do select "Ordenar" como ordem; a urgência é "sem ordem" (`null`). */
export function ordemDoSelect(valor: string): Ordem | null {
  const coluna = ORDENS_SELECT.find((o) => o === valor);
  if (!coluna || coluna === "urgencia") return null;
  return { coluna, dir: DIRECAO_INICIAL[coluna] };
}

/** A ordem de uma coluna como valor do select. */
export const selectDaOrdem = (ordem: Ordem | null): OrdemSelect => ordem?.coluna ?? "urgencia";
