/**
 * Mantem a data de fim de um contrato a termo certo coerente com a duracao em
 * meses, nos dois ecras que a pedem (o assistente "Nova pessoa" e o separador
 * Contratos da ficha).
 *
 * A REGRA
 * -------
 * So no termo certo, e so com meses validos: sempre que o INICIO, os MESES ou
 * o TIPO mudam, a data de fim passa a ser a vespera do dia correspondente
 * (`dataFimPorDuracaoMeses`: 31/01 + 1 mes = 28/02). Sem meses, ou com um
 * inicio por preencher, nao faz nada -- nunca apaga uma data escrita a mao.
 *
 * O caminho inverso (escrever a data a mao e os meses acertarem-se, ou
 * ficarem vazios se nenhuma duracao a produz) esta em `meses` e `data_fim`
 * mudarem JUNTOS no mesmo `onPatch` de quem escreve a data -- ver
 * `mesesDaDataFim`. Com os dois sempre coerentes, este efeito so escreve
 * quando o inicio ou os meses mudaram de facto.
 */
import { useEffect } from "react";
import { tipoTemDuracaoEmMeses } from "@/lib/hr/contrato";
import { dataFimPorDuracaoMeses, mesesExactos } from "@/lib/hr/novaPessoaDatas";
import type { TipoContrato } from "@/types/hr";

/** Os meses como texto de input -> inteiro, ou `null` se vazio / nao inteiro. */
export function mesesDoTexto(texto: string): number | null {
  const limpo = texto.trim();
  if (limpo === "") return null;
  const n = Number(limpo.replace(",", "."));
  return Number.isInteger(n) ? n : null;
}

/** Os meses (texto) que correspondem a uma data de fim escrita a mao; "" se nenhuma duracao a produz. */
export function mesesDaDataFim(dataInicio: string, dataFim: string): string {
  const meses = mesesExactos(dataInicio, dataFim);
  return meses === null ? "" : String(meses);
}

interface Parametros {
  tipoContrato: TipoContrato | "";
  /** O inicio a usar: a data de inicio do contrato, ou (no assistente) a de admissao se esta estiver vazia. */
  inicioEfectivo: string;
  duracaoMeses: string;
  dataFim: string;
  onDataFim: (dataFim: string) => void;
}

export function useFimDoContratoPorMeses({
  tipoContrato,
  inicioEfectivo,
  duracaoMeses,
  dataFim,
  onDataFim,
}: Parametros): void {
  useEffect(() => {
    if (!tipoTemDuracaoEmMeses(tipoContrato)) return;
    const meses = mesesDoTexto(duracaoMeses);
    if (meses === null) return;
    const calculada = dataFimPorDuracaoMeses(inicioEfectivo, meses);
    if (calculada !== null && calculada !== dataFim) onDataFim(calculada);
  }, [tipoContrato, inicioEfectivo, duracaoMeses, dataFim, onDataFim]);
}
