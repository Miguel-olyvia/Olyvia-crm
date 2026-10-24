import { useMemo, useRef } from "react";

interface Acumulado<V> {
  organizationId: string | null;
  mapa: ReadonlyMap<string, V>;
}

/**
 * Mantém o último valor conhecido de cada id enquanto as leituras em lote recarregam. As leituras usam o conteúdo do lote como
 * chave de cache: ao mudar a ordem ou ao carregar mais uma página os lotes mudam, e sem isto todas as linhas voltavam a «Sem dado»
 * até a resposta chegar. Um valor novo substitui o antigo; ao mudar de organização o mapa começa vazio (nunca se mostra um valor
 * de outra organização).
 */
export function useUltimoConhecidoPorId<V>(atual: ReadonlyMap<string, V>, organizationId: string | null): ReadonlyMap<string, V> {
  const guardado = useRef<Acumulado<V>>({ organizationId, mapa: new Map() });
  return useMemo(() => {
    const base = guardado.current.organizationId === organizationId ? guardado.current.mapa : new Map<string, V>();
    const mapa = new Map(base);
    for (const [id, valor] of atual) mapa.set(id, valor);
    guardado.current = { organizationId, mapa };
    return mapa;
  }, [atual, organizationId]);
}
