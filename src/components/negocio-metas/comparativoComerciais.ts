// Comparação entre comerciais: ordenar, somar a equipa e filtrar os negócios.
import { percentagem, type NegocioMes, type ProgressoMeta, type TotaisComercial } from "./negocioMetas";

export type OrdemGanho = "desc" | "asc";

/** Ordena pelo ganho (maior primeiro por omissão); empates pelo nome. Não altera a lista. */
export function ordenarPorGanho(
  totais: readonly TotaisComercial[],
  ordem: OrdemGanho,
): TotaisComercial[] {
  const sentido = ordem === "desc" ? -1 : 1;
  return [...totais].sort(
    (a, b) => sentido * (a.atual - b.atual) || a.comercial.localeCompare(b.comercial),
  );
}

/** Total da equipa: soma dos ganhos e das metas e a percentagem do conjunto. */
export function totalEquipa(totais: readonly TotaisComercial[]): ProgressoMeta {
  const atual = totais.reduce((s, c) => s + c.atual, 0);
  const meta = totais.reduce((s, c) => s + c.meta, 0);
  return { atual, meta, percentagem: percentagem(atual, meta) };
}

/** Só os negócios do comercial; `null` devolve todos. */
export function filtrarPorComercial(
  negocios: readonly NegocioMes[],
  comercial: string | null,
): NegocioMes[] {
  return comercial === null ? [...negocios] : negocios.filter((n) => n.comercial === comercial);
}
