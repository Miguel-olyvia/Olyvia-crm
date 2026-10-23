// Pequenas funções comuns aos adaptadores da ficha real (puras, sem rede nem relógio).

/** O texto aparado, ou null se não for texto ou ficar vazio. */
export function textoOuNull(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const aparado = valor.trim();
  return aparado === "" ? null : aparado;
}

/** Um numeric da base (número ou texto) em número; 0 se não for um número finito. */
export function numero(valor: unknown): number {
  const n = Number(valor ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** O valor, se for um dos aceites; senão null. */
export function escolher<T extends string>(valor: string | null | undefined, aceites: readonly T[]): T | null {
  return aceites.find((a) => a === valor) ?? null;
}

/** Os instantes ISO por ordem do mais recente para o mais antigo (copia, nunca muta); iguais ou inválidos mantêm a ordem. */
export function maisRecentePrimeiro<T>(itens: readonly T[], instante: (item: T) => string | null): T[] {
  const ms = (item: T): number => {
    const t = new Date(instante(item) ?? "").getTime();
    return Number.isNaN(t) ? 0 : t;
  };
  return itens.map((item, indice) => ({ item, indice })).sort((a, b) => ms(b.item) - ms(a.item) || a.indice - b.indice).map((x) => x.item);
}
