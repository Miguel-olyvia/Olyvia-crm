import { useComerciaisNegocio } from "./useComerciaisNegocio";
import { useFontePessoas } from "./useFontePessoas";

/**
 * O comercial de partida de uma visita nova na ficha real: o nome de quem está na sessão, se for um dos comerciais da organização (a mesma lista
 * do «Feito por»); senão vazio. Nunca o nome de exemplo. Fora do modo real devolve vazio (o exemplo tem os seus próprios comerciais).
 */
export function useComercialDaSessao(): string {
  const fonte = useFontePessoas();
  const { comerciais } = useComerciaisNegocio(fonte.modo === "real");
  if (fonte.modo !== "real" || !fonte.utilizadorId) return "";
  return comerciais.find((c) => c.id === fonte.utilizadorId)?.nome ?? "";
}
