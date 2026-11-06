// Registo único dos modelos detalhados de lava-loiça portados do HTML (Frasa e RODI): o visualizador usa só este ponto de entrada.
import * as THREE from "three";
import { construirLavaLoica as construirBase, ehModeloLavaLoica as ehBase, materiaisDaLavaLoicaBase, modelosDeLavaLoica as todosBase, type LavaLoicaHtml, type OpcoesLavaLoica } from "./lavaLoicas";
import { construirRodi, ehModeloRodi, materiaisRodi, modelosRodi } from "./lavaLoicasRodi";
/** Os materiais de qualquer lava-loiça portada, por nome de parte (os mesmos que o construtor usa): para os GLB pré-gerados. */
export const materiaisDaLavaLoica = (modelo: string, acab: string): Record<string, THREE.Material> => (ehModeloRodi(modelo) ? { ...materiaisRodi(modelo) } : materiaisDaLavaLoicaBase(modelo, acab));

export type { LavaLoicaHtml, OpcoesLavaLoica };
export const modelosDeLavaLoica = (): string[] => [...todosBase(), ...modelosRodi()];
export const ehModeloLavaLoica = (id: string): boolean => ehBase(id) || ehModeloRodi(id);
/** Constrói qualquer lava-loiça portada (em mm): Velar, Lody, Ambar, Keran, UNA e Cubas. */
export function construirLavaLoica(modelo: string, acab: string, o: OpcoesLavaLoica = {}): LavaLoicaHtml {
  if (ehModeloRodi(modelo)) { const r = construirRodi(modelo, { reverso: o.reverso }); return { grupo: r.grupo, tampas: [], materiais: r.materiais }; }
  return construirBase(modelo, acab, o);
}