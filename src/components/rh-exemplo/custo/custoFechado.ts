/**
 * O custo de um mes FECHADO: as horas (planeadas e realizadas) e a retribuicao sao as que ficaram gravadas no fecho do periodo
 * (`hr_processamento_resultados`), nunca recalculadas. A TSU, o seguro (do cargo de HOJE), os equipamentos, as excecoes e o banco de horas continuam vivos.
 * Sem React e sem base.
 */
import { minutosDeLinhaGravada, resultadoDeLinhaGravada, type ResultadoLido } from "@/components/rh-exemplo/hooks/useProcessamentoResultados";
import { decomposicaoDoResultado, type DecomposicaoRetribuicao } from "@/components/rh-exemplo/lib/contasDoMes";
import { retribuicaoSemPontuais } from "./lancamentosCusto";

export interface ValoresDoFecho {
  planeadoMinutos: number;
  realizadoMinutos: number;
  /** `total_bruto` menos `totais.lancamentos_pontuais` (os pontuais contam a parte, como avulsos); `null` = sem retribuicao gravada. */
  retribuicaoMes: number | null;
  /** A retribuicao separada em partes, a partir das linhas e dos totais gravados; `null` = sem base do mes gravada. */
  decomposicao: DecomposicaoRetribuicao | null;
}

/** O que o fecho gravou para a pessoa, ou `null` se nao ha linha (ou ela nao tem minutos validos): nunca um 0 inventado. */
export function valoresDoFecho(linha: ResultadoLido | undefined): ValoresDoFecho | null {
  if (!linha) return null;
  const minutos = minutosDeLinhaGravada(linha);
  if (!minutos) return null;
  const resultado = resultadoDeLinhaGravada(linha);
  return { ...minutos, retribuicaoMes: retribuicaoSemPontuais({ resultado }), decomposicao: decomposicaoDoResultado(resultado) };
}

/** Pessoa que so existe no gravado (saiu depois do fecho e ja nao vem da lista): o minimo para o custo. */
export function pessoaDaLinhaGravada(linha: ResultadoLido) {
  return { id: linha.pessoa_id, nome_completo: linha.pessoa_nome || "—", cargo: null, cargo_id: null, local_id: null, soNoGravado: true as const };
}
