/**
 * A indicação do responsável sobre o fim de um contrato (fluxo 3), em memória. O responsável só INDICA
 * («Continuar», «Não continuar» ou «Por decidir»): nada se renova nem termina por causa disto. Quem renova
 * ou termina é o RH, no cartão «Fim do contrato».
 */
import type { FichaRh } from "@/components/rh-exemplo/dados/tiposLoja";
import type { RespostaIndicacao } from "@/components/rh-exemplo/lib/fimContrato";

/** Os três botões da janela do responsável, pela ordem em que aparecem. */
export const OPCOES_INDICACAO: ReadonlyArray<{ resposta: RespostaIndicacao; chave: string }> = [
  { resposta: "pretendo_continuar", chave: "rhA.fimContrato.continuar" },
  { resposta: "nao_pretendo_continuar", chave: "rhA.fimContrato.naoContinuar" },
  { resposta: "ainda_por_decidir", chave: "rhA.fimContrato.porDecidir" },
];

/**
 * Regista (ou muda) a indicação do ciclo actual do contrato: uma por ciclo, a última substitui a anterior.
 * Devolve a mesma ficha se o contrato não existe nela.
 */
export function aplicarIndicacao(ficha: FichaRh, vinculoId: string, resposta: RespostaIndicacao, quando: string): FichaRh {
  const vinculo = ficha.vinculos.find((v) => v.id === vinculoId);
  if (!vinculo?.data_fim) return ficha;
  const ciclo = vinculo.data_fim;
  const semAnterior = ficha.indicacoes.filter((i) => !(i.vinculo_id === vinculoId && i.ciclo_fim === ciclo));
  return {
    ...ficha,
    indicacoes: [...semAnterior, { id: `ind-${vinculoId}-${ciclo}`, vinculo_id: vinculoId, ciclo_fim: ciclo, resposta, indicada_em: quando }],
    respostasFim: { ...ficha.respostasFim, [vinculoId]: { resposta, em: quando } },
  };
}

/** Os contratos a terminar de quem reporta a `responsavelId` (a equipa dele). */
export function daEquipa<T extends { pessoa_id: string }>(
  contratos: readonly T[],
  fichas: Record<string, FichaRh>,
  responsavelId: string,
): T[] {
  return contratos.filter((c) => fichas[c.pessoa_id]?.pessoa.reporta_a_pessoa_id === responsavelId);
}

/** Quem são os responsáveis com contratos da equipa a terminar, sem repetir. */
export function responsaveisDosContratos(
  contratos: ReadonlyArray<{ pessoa_id: string }>,
  fichas: Record<string, FichaRh>,
): string[] {
  const ids = contratos
    .map((c) => fichas[c.pessoa_id]?.pessoa.reporta_a_pessoa_id ?? null)
    .filter((id): id is string => id !== null);
  return [...new Set(ids)];
}
