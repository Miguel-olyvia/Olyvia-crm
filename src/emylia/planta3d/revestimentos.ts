// Protótipo (visualizador 3D): os revestimentos por superfície (pavimento e parede), escolhidos numa lista. Só dados: a textura procedural
// (azulejo com juntas, madeira, tinta) desenha-se no visualizador, num canvas, sem ficheiros externos.
export type TipoRevestimento = "azulejo" | "madeira" | "tinta";
export interface Revestimento {
  id: string; nome: string; tipo: TipoRevestimento; cor: string; junta?: string;
  /** Lado de uma peça de azulejo, ou largura de uma tábua (m). */ modulo: number;
  /** 18/11: a outra medida de uma peça retangular (m), na vertical da superfície (a altura na parede, o fundo no chão). Sem ela, quadrada. */
  moduloAlto?: number;
}
export type Superficie = "pavimento" | "parede";

export const PAVIMENTOS: Revestimento[] = [
  { id: "ceramico_claro", nome: "Cerâmico claro 60×60", tipo: "azulejo", cor: "#d9d6cf", junta: "#b8b4ab", modulo: 0.6 },
  { id: "ceramico_escuro", nome: "Cerâmico antracite 60×60", tipo: "azulejo", cor: "#5b5f66", junta: "#3f4348", modulo: 0.6 },
  { id: "madeira_carvalho", nome: "Soalho de carvalho", tipo: "madeira", cor: "#b68b5a", modulo: 0.18 },
  { id: "madeira_escura", nome: "Soalho escuro", tipo: "madeira", cor: "#6b4a30", modulo: 0.18 },
  { id: "microcimento", nome: "Microcimento", tipo: "tinta", cor: "#a9a9a6", modulo: 1 },
];
export const PAREDES: Revestimento[] = [
  { id: "tinta_branca", nome: "Tinta branca", tipo: "tinta", cor: "#f2f1ed", modulo: 1 },
  { id: "tinta_cinza", nome: "Tinta cinzenta", tipo: "tinta", cor: "#c9ccd0", modulo: 1 },
  { id: "tinta_verde", nome: "Tinta verde-salva", tipo: "tinta", cor: "#a9bfae", modulo: 1 },
  { id: "azulejo_branco", nome: "Azulejo branco 30×30", tipo: "azulejo", cor: "#f4f4f2", junta: "#cfcfcb", modulo: 0.3 },
  { id: "azulejo_azul", nome: "Azulejo azul 30×30", tipo: "azulejo", cor: "#5f8aa8", junta: "#dfe6ea", modulo: 0.3 },
  { id: "madeira_parede", nome: "Lambrim de madeira", tipo: "madeira", cor: "#c4a077", modulo: 0.12 },
];

export const REVESTIMENTOS: Record<Superficie, Revestimento[]> = { pavimento: PAVIMENTOS, parede: PAREDES };

/** O revestimento pelo id; um id desconhecido (um gravado antes de a lista mudar) dá o primeiro da lista. */
export const revestimentoDe = (superficie: Superficie, id: string): Revestimento => REVESTIMENTOS[superficie].find((r) => r.id === id) ?? REVESTIMENTOS[superficie][0];

/** O que se desenha numa superfície: o material do produto escolhido, se há (Estúdio), senão o da lista pelo id. */
export const revestimentoDaSuperficie = (rev: { pavimento: string; parede: string; materiais?: Partial<Record<Superficie, Revestimento>> }, superficie: Superficie): Revestimento =>
  rev.materiais?.[superficie] ?? revestimentoDe(superficie, rev[superficie]);

/** Quantas vezes a textura se repete numa superfície de `w`×`h` m: uma repetição é uma peça (azulejo) ou quatro tábuas (madeira). */
export function repeticoes(r: Revestimento, w: number, h: number): [number, number] {
  const lx = r.tipo === "madeira" ? r.modulo * 4 : r.modulo;
  const ly = r.tipo === "madeira" ? r.modulo * 4 : (r.moduloAlto ?? r.modulo);
  return [Math.max(0.1, w / lx), Math.max(0.1, h / ly)];
}
