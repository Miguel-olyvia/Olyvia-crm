// Os custos da V2 (parâmetros, perfis, equipamentos, estrutura e as receitas mexidas), lidos com useSyncExternalStore.
// 22/10/2026: deixaram de viver só em memória. A página liga a store ao Estado aberto (ligarCustos): ler é ler S.custos e
// mudar escreve em S.custos, por isso os custos gravam-se com o resto (localStorage) e vão para os outros aparelhos na parte
// "global" da sincronização. Sem Estado ligado (alguns testes), a store guarda os seus, como antes.
// O que o orçamento precisa (horas, €/h, equipamentos, consumíveis, preço) passa para S.svc com aplicarTodos, ao editar.
import { useSyncExternalStore } from "react";
import { custos0, garantirCustos, type Custos } from "./custosModelo";
import { reporCatalogo } from "./catalogoStore";

let estado: Custos = custos0();
/** O Estado a que a store está ligada (o da página). */
let alvo: { custos?: Custos } | null = null;
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((o) => o());

export const lerCustos = (): Custos => estado;
/** Liga a store aos custos de um Estado (garante-os nos estados de antes). Chama-se ao ler, repor ou sincronizar o Estado. */
export function ligarCustos(S: { custos?: Custos }): void {
  garantirCustos(S);
  alvo = S;
  if (estado !== S.custos) { estado = S.custos!; avisar(); }
}
/** Muda os custos: a função recebe uma cópia e devolve-a mexida (ou muda-a no sítio). Com um Estado ligado, fica nele. */
export function mudarCustos(fn: (c: Custos) => Custos | void): Custos {
  const copia = structuredClone(estado);
  estado = fn(copia) || copia;
  if (alvo) alvo.custos = estado;
  avisar();
  return estado;
}
export function reporCustos(): void {
  estado = custos0();
  if (alvo) alvo.custos = estado;
  reporCatalogo(); // pacotes, materiais e a árvore (catalogoStore.ts)
  avisar();
}
const subscrever = (o: () => void) => { ouvintes.add(o); return () => { ouvintes.delete(o); }; };
export const useCustos = (): Custos => useSyncExternalStore(subscrever, lerCustos, lerCustos);
