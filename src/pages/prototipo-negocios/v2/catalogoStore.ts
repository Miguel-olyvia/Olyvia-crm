// O Catálogo da V2, parte 2 (pacotes, materiais e a árvore de classificação), em memória,
// numa store de módulo lida com useSyncExternalStore, como custosStore.ts: dura até recarregar.
// "Repor a demonstração" limpa-a: reporCustos() chama reporCatalogo().
import { useSyncExternalStore } from "react";
import { catalogo0, type Catalogo } from "./catalogoModelo";

let estado: Catalogo = catalogo0();
const ouvintes = new Set<() => void>();

export const lerCatalogo = (): Catalogo => estado;
/** Muda o catálogo: a função recebe uma cópia e devolve-a mexida (ou muda-a no sítio). */
export function mudarCatalogo(fn: (k: Catalogo) => Catalogo | void): Catalogo {
  const copia = structuredClone(estado);
  estado = fn(copia) || copia;
  ouvintes.forEach((o) => o());
  return estado;
}
/** Volta a uma versão anterior (o "Anular"). */
export function porCatalogo(k: Catalogo): void {
  estado = k;
  ouvintes.forEach((o) => o());
}
export function reporCatalogo(): void {
  estado = catalogo0();
  ouvintes.forEach((o) => o());
}
const subscrever = (o: () => void) => { ouvintes.add(o); return () => { ouvintes.delete(o); }; };
export const useCatalogo = (): Catalogo => useSyncExternalStore(subscrever, lerCatalogo, lerCatalogo);
