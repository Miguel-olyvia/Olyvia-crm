/**
 * Datas civis do formulario de criar pessoa (periodo experimental, termo do
 * contrato, "hoje"). Saiu de `novaPessoa.ts`, que reexporta as tres funcoes.
 *
 * NUNCA `toISOString`: converte para UTC e, em Lisboa, devolve o dia anterior.
 * Uma data civil nao e um instante.
 */

/**
 * Calcula a data de fim do periodo experimental a partir da duracao.
 *
 * A base guarda as duas coisas (`periodo_experimental_dias` e
 * `periodo_experimental_ate`) e NAO deriva uma da outra por trigger, para nao
 * haver duas fontes de verdade em silencio. Quem deriva e o ecra, aqui, e so
 * quando a duracao esta preenchida e a data nao.
 */
export function dataDoPeriodoExperimental(dataInicio: string, dias: number): string | null {
  if (dataInicio.trim() === "") return null;
  const inicio = new Date(`${dataInicio}T00:00:00`);
  if (Number.isNaN(inicio.getTime())) return null;
  inicio.setDate(inicio.getDate() + dias);
  // NAO se usa `toISOString`: ela converte para UTC e, em Lisboa no horario de
  // verao, devolvia o dia ANTERIOR -- 90 dias a partir de 1 de Janeiro davam
  // 31 de Marco em vez de 1 de Abril. A data e civil, nao um instante.
  const mes = String(inicio.getMonth() + 1).padStart(2, "0");
  const dia = String(inicio.getDate()).padStart(2, "0");
  return `${inicio.getFullYear()}-${mes}-${dia}`;
}

/**
 * Mesmo padrao de `dataDoPeriodoExperimental`, para a data de termino de um
 * contrato com prazo (termo certo/incerto): quem preenche a duracao em meses,
 * o ecra calcula a data sozinho -- `data_fim` continua um campo normal,
 * directamente editavel e sobreponivel a seguir, a base nunca deriva nada por
 * trigger.
 */
export function dataFimPorDuracaoMeses(dataInicio: string, meses: number): string | null {
  if (dataInicio.trim() === "") return null;
  const inicio = new Date(`${dataInicio}T00:00:00`);
  if (Number.isNaN(inicio.getTime())) return null;
  inicio.setMonth(inicio.getMonth() + meses);
  // Mesma razao do cabecalho de dataDoPeriodoExperimental: nao usar
  // toISOString, que converte para UTC e pode devolver o dia anterior em
  // horario de verao. A data e civil, nao um instante.
  const mes = String(inicio.getMonth() + 1).padStart(2, "0");
  const dia = String(inicio.getDate()).padStart(2, "0");
  return `${inicio.getFullYear()}-${mes}-${dia}`;
}

/**
 * A data de hoje como data CIVIL, no fuso de quem esta a usar a aplicacao.
 *
 * `toISOString().slice(0, 10)` parece equivalente e nao e: converte para UTC e,
 * em Lisboa, a meia-noite e meia devolve o dia anterior. Uma data de admissao
 * errada por um dia nao da erro nenhum -- so fica errada.
 */
export function dataDeHoje(): string {
  const agora = new Date();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const dia = String(agora.getDate()).padStart(2, "0");
  return `${agora.getFullYear()}-${mes}-${dia}`;
}
