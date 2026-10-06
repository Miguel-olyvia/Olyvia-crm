/**
 * Datas do formulario de criar pessoa (periodo experimental, termo do
 * contrato, "hoje"). Saiu de `novaPessoa.ts`, que reexporta as tres funcoes.
 *
 * As duas somas (periodo experimental e termo) sao datas CIVIS: NUNCA
 * `toISOString`, que converte para UTC e, em Lisboa, devolve o dia anterior.
 * O "hoje", pelo contrario, e o da base (UTC): ver `dataDeHoje`.
 */
import { dataDeHojeBase } from "@/lib/hr/dataBase";


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
 * A data de hoje QUE SE ENVIA A BASE (admissao por omissao, inicio do vinculo,
 * afectacao, retribuicao): o dia UTC, igual ao `current_date` das migrations.
 * Ver `dataBase.ts`: o dia civil local difere do da base entre as 00:00 e as
 * 01:00 de Lisboa no verao, e as regras "so de hoje para a frente" / "nao antes
 * de o cargo abrir" comparam com o `current_date`.
 */
export function dataDeHoje(): string {
  return dataDeHojeBase();
}
