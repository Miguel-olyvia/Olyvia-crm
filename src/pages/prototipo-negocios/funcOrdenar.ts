// Ordenar listas na V2 funcional, sem React: estável (em empate fica a ordem de entrada), os valores vazios sempre no fim (em qualquer direção)
// e o texto pela ordem portuguesa, sem ligar a maiúsculas nem acentos. Também a ordem das colunas da Lista de Pessoas e o aria-sort.
export type Direcao = "asc" | "desc";
export type Chave = string | number | null | undefined;

const vazio = (v: Chave): boolean => v === null || v === undefined || v === "" || (typeof v === "number" && Number.isNaN(v));

function comparar(a: Chave, b: Chave): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "pt", { sensitivity: "base", numeric: true });
}

/** Uma cópia ordenada pela chave. Não muda a lista recebida. */
export function ordenarPor<T>(itens: readonly T[], chave: (x: T) => Chave, dir: Direcao): T[] {
  const sinal = dir === "asc" ? 1 : -1;
  return itens.map((x, i) => ({ x, i, k: chave(x) }))
    .sort((a, b) => {
      const va = vazio(a.k), vb = vazio(b.k);
      if (va || vb) return va === vb ? a.i - b.i : va ? 1 : -1;
      return sinal * comparar(a.k, b.k) || a.i - b.i;
    })
    .map((e) => e.x);
}

/** As colunas que se ordenam na Lista de Pessoas e a direção com que começam. */
export type ColunaOrdem = "pessoa" | "contacto" | "proximo" | "valor";
export const COLUNAS_ORDEM: readonly { id: ColunaOrdem; nome: string; dir: Direcao }[] = [
  { id: "pessoa", nome: "Pessoa", dir: "asc" }, { id: "contacto", nome: "Último contacto", dir: "asc" },
  { id: "proximo", nome: "Próximo passo", dir: "asc" }, { id: "valor", nome: "Valor", dir: "desc" },
];

export interface OrdemLista { coluna: ColunaOrdem; dir: Direcao }

/** Carregar num cabeçalho: na mesma coluna troca a direção; noutra começa pela direção dela. */
export function alternarOrdem(atual: OrdemLista | null, coluna: ColunaOrdem): OrdemLista {
  if (atual && atual.coluna === coluna) return { coluna, dir: atual.dir === "asc" ? "desc" : "asc" };
  return { coluna, dir: COLUNAS_ORDEM.find((c) => c.id === coluna)!.dir };
}

/** O valor de aria-sort do cabeçalho de uma coluna. */
export function ariaSort(atual: OrdemLista | null, coluna: ColunaOrdem): "ascending" | "descending" | "none" {
  if (!atual || atual.coluna !== coluna) return "none";
  return atual.dir === "asc" ? "ascending" : "descending";
}
