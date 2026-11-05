// Registo único dos modelos detalhados de lava-loiça portados do HTML (Frasa e RODI): o visualizador usa só este ponto de entrada.
import { construirLavaLoica as construirBase, ehModeloLavaLoica as ehBase, modelosDeLavaLoica as todosBase, type LavaLoicaHtml, type OpcoesLavaLoica } from "./lavaLoicas";
import { construirRodi, ehModeloRodi, modelosRodi } from "./lavaLoicasRodi";

export type { LavaLoicaHtml, OpcoesLavaLoica };
export const modelosDeLavaLoica = (): string[] => [...todosBase(), ...modelosRodi()];
export const ehModeloLavaLoica = (id: string): boolean => ehBase(id) || ehModeloRodi(id);
/** Constrói qualquer lava-loiça portada (em mm): Velar, Lody, Ambar, Keran, UNA e Cubas. */
export function construirLavaLoica(modelo: string, acab: string, o: OpcoesLavaLoica = {}): LavaLoicaHtml {
  if (ehModeloRodi(modelo)) { const r = construirRodi(modelo, { reverso: o.reverso }); return { grupo: r.grupo, tampas: [], materiais: r.materiais }; }
  return construirBase(modelo, acab, o);
}