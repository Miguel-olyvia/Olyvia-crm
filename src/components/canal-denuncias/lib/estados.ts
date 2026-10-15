// Transições válidas do estado de uma denúncia. Uma denúncia nova só avança depois de se confirmar a receção.
import type { EstadoDenuncia } from "./tipos";

export const TRANSICOES: Record<EstadoDenuncia, readonly EstadoDenuncia[]> = {
  recebida: ["em_analise", "arquivada"],
  em_analise: ["mais_info", "concluida", "arquivada"],
  mais_info: ["em_analise", "concluida", "arquivada"],
  concluida: ["em_analise"],
  arquivada: ["em_analise"],
};

export const podeTransitar = (de: EstadoDenuncia, para: EstadoDenuncia): boolean => TRANSICOES[de].includes(para);

export const estaFechada = (estado: EstadoDenuncia): boolean => estado === "concluida" || estado === "arquivada";

/** Aberta e já com a receção confirmada: dá para conversar, pedir informação e decidir. */
export const estaEmTratamento = (estado: EstadoDenuncia): boolean => estado === "em_analise" || estado === "mais_info";
