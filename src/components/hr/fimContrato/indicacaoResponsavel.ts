/**
 * A indicação do responsável sobre o fim de um contrato (fluxo 3). O responsável só INDICA («Continuar», «Não continuar»
 * ou «Por decidir»): nada se renova nem termina por causa disto. Quem renova ou termina é o RH, no cartão «Fim do contrato».
 *
 * Aqui só se escolhe, das indicações que `usePessoaContratoFim` já leu, a que vale agora.
 */
import type { IndicacaoContrato } from "@/lib/hr/fimContrato";

/**
 * A indicação do ciclo ATUAL do contrato: a do mesmo contrato e da data de fim de agora. Depois de uma renovação a data de
 * fim muda e o ciclo recomeça por decidir. Havendo mais do que uma no mesmo ciclo, vale a última (por data), seja qual
 * for a ordem da lista. Sem data de fim (contrato sem termo) não há ciclo, logo não há indicação.
 */
export function indicacaoDoCiclo(
  indicacoes: readonly IndicacaoContrato[],
  vinculoId: string,
  cicloFim: string | null,
): IndicacaoContrato | null {
  if (cicloFim === null) return null;
  const doCiclo = indicacoes.filter((i) => i.vinculo_id === vinculoId && i.ciclo_fim === cicloFim);
  if (doCiclo.length === 0) return null;
  return doCiclo.reduce((ultima, i) => (i.indicada_em > ultima.indicada_em ? i : ultima));
}
