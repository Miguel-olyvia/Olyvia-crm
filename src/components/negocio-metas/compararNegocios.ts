// Comparação de até 3 negócios lado a lado. Só decide as "melhores células" das
// duas linhas em que há uma: o maior valor e o mais parado. Empates marcam todos
// os empatados; se todas as células forem iguais não há melhor.
import { temValor } from "./logicaQuadro";
import { valorDoNegocio, type NegocioMes } from "./negocioMetas";
import { saudeDoNegocio, type SaudeNegocio } from "./saudeNegocio";

export const MAXIMO_COMPARACAO = 3;

export interface ComparacaoNegocios {
  /** Os negócios comparados, na ordem recebida (no máximo 3). */
  negocios: NegocioMes[];
  /** Saúde de cada negócio, na mesma ordem de `negocios`. */
  saude: SaudeNegocio[];
  /** Ids com o maior valor (só negócios com orçamento escolhido). */
  melhorValor: string[];
  /** Ids com mais dias parado (só os que têm "parado"). */
  maisParado: string[];
}

/** Os ids cujo valor é o máximo; vazio se ninguém tem valor ou se todos os que têm são iguais. */
function idsDoMaximo(pares: readonly { id: string; valor: number | null }[]): string[] {
  const comValor = pares.filter((p): p is { id: string; valor: number } => p.valor !== null);
  if (comValor.length === 0) return [];
  const maximo = Math.max(...comValor.map((p) => p.valor));
  const vencedores = comValor.filter((p) => p.valor === maximo);
  const todosIguais = vencedores.length === comValor.length;
  return todosIguais ? [] : vencedores.map((p) => p.id);
}

export function compararNegocios(negocios: readonly NegocioMes[], hoje: string): ComparacaoNegocios {
  const lista = negocios.slice(0, MAXIMO_COMPARACAO);
  return {
    negocios: lista,
    saude: lista.map((n) => saudeDoNegocio(n, hoje)),
    melhorValor: idsDoMaximo(lista.map((n) => ({ id: n.id, valor: temValor(n) ? valorDoNegocio(n) : null }))),
    maisParado: idsDoMaximo(lista.map((n) => ({ id: n.id, valor: n.parado }))),
  };
}
