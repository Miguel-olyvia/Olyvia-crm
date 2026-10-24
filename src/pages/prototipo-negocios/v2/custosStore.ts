// Os custos da V2 (parâmetros, perfis, equipamentos, estrutura e as receitas mexidas)
// vivem só em memória, numa store de módulo lida com useSyncExternalStore, como diaADia.ts:
// duram até recarregar. Não tocam no Estado; o que o orçamento precisa (horas, €/h,
// equipamentos, consumíveis, preço) passa para S.svc com aplicarTodos, ao editar.
import { useSyncExternalStore } from "react";
import { custos0, type Custos } from "./custosModelo";
import { reporCatalogo } from "./catalogoStore";

let estado: Custos = custos0();
const ouvintes = new Set<() => void>();

export const lerCustos = (): Custos => estado;
/** Muda os custos: a função recebe uma cópia e devolve-a mexida (ou muda-a no sítio). */
export function mudarCustos(fn: (c: Custos) => Custos | void): Custos {
  const copia = structuredClone(estado);
  estado = fn(copia) || copia;
  ouvintes.forEach((o) => o());
  return estado;
}
export function reporCustos(): void {
  estado = custos0();
  reporCatalogo(); // pacotes, materiais e a árvore (catalogoStore.ts)
  ouvintes.forEach((o) => o());
}
const subscrever = (o: () => void) => { ouvintes.add(o); return () => { ouvintes.delete(o); }; };
export const useCustos = (): Custos => useSyncExternalStore(subscrever, lerCustos, lerCustos);
