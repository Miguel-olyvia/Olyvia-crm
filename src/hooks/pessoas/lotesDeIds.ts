// Parte uma lista de ids em lotes de uma página (100): as leituras por linha da Lista real fazem UMA chamada por lote, nunca uma por linha.

/** O tamanho de uma página da Lista real (e o máximo que cada leitura em lote leva). */
export const TAMANHO_LOTE = 100;

/** Sem repetidos nem valores vazios, pela ordem de chegada, em lotes de `tamanho`. */
export function lotesDeIds(ids: readonly (string | null | undefined)[], tamanho: number = TAMANHO_LOTE): string[][] {
  const unicos = [...new Set(ids.filter((id): id is string => typeof id === "string" && id !== ""))];
  const lotes: string[][] = [];
  for (let i = 0; i < unicos.length; i += tamanho) lotes.push(unicos.slice(i, i + tamanho));
  return lotes;
}
