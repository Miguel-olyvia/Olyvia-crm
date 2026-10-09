/**
 * Datas do formulario de criar pessoa (periodo experimental, termo do
 * contrato, "hoje"). Saiu de `novaPessoa.ts`, que reexporta as funcoes.
 *
 * As contas de datas (periodo experimental e termo) sao datas CIVIS, feitas
 * so com inteiros (ano, mes, dia) e `Date.UTC` para o calendario: nunca um
 * instante local, que em Lisboa no horario de verao devolve o dia anterior.
 * O "hoje", pelo contrario, e o da base (UTC): ver `dataDeHoje`.
 */
import { dataDeHojeBase } from "@/lib/hr/dataBase";

/** O mais que a duracao em meses pode valer: o limite do campo e da inversa. */
export const MESES_MAXIMOS_CONTRATO = 48;

const FORMATO_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

interface DiaCivil {
  ano: number;
  mes: number; // 1..12
  dia: number;
}

function diasDoMes(ano: number, mes: number): number {
  // Dia 0 do mes seguinte e o ultimo deste.
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

function lerDia(iso: string): DiaCivil | null {
  const partes = FORMATO_ISO.exec(iso.trim());
  if (!partes) return null;
  const ano = Number(partes[1]);
  const mes = Number(partes[2]);
  const dia = Number(partes[3]);
  if (mes < 1 || mes > 12 || dia < 1 || dia > diasDoMes(ano, mes)) return null;
  return { ano, mes, dia };
}

function escreverDia({ ano, mes, dia }: DiaCivil): string {
  return `${String(ano).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/**
 * Calcula a data de fim do periodo experimental a partir da duracao.
 *
 * O PRIMEIRO DIA CONTA: o periodo de N dias que comeca a 04/01 acaba a
 * 04/01 + N - 1 (90 dias a partir de 04/01/2027 acabam a 03/04/2027). Sem
 * duracao (0, negativa, vazia ou nao inteira) nao ha data: devolve `null`.
 *
 * A base guarda as duas coisas (`periodo_experimental_dias` e
 * `periodo_experimental_ate`) e NAO deriva uma da outra por trigger, para nao
 * haver duas fontes de verdade em silencio. Quem deriva e o ecra, aqui, e so
 * quando a duracao esta preenchida e a data nao.
 */
export function dataDoPeriodoExperimental(dataInicio: string, dias: number): string | null {
  const inicio = lerDia(dataInicio);
  if (!inicio) return null;
  if (!Number.isInteger(dias) || dias < 1) return null;
  const fim = new Date(Date.UTC(inicio.ano, inicio.mes - 1, inicio.dia + dias - 1));
  return escreverDia({
    ano: fim.getUTCFullYear(),
    mes: fim.getUTCMonth() + 1,
    dia: fim.getUTCDate(),
  });
}

/**
 * A data de fim de um contrato a termo certo por duracao em meses: a VESPERA
 * do dia correspondente.
 *
 * Soma-se `meses` ao inicio colando o dia ao ultimo dia do mes de chegada:
 *   - se o dia correspondente existe, o fim e a vespera dele
 *     (01/01/2027 + 12 meses = 31/12/2027; 15/10/2026 + 6 = 14/04/2027);
 *   - se o dia correspondente NAO existe (31/01 + 1 mes), o fim e o ultimo dia
 *     do mes (31/01/2027 + 1 = 28/02/2027; 31/01/2028 + 1 = 29/02/2028).
 * Sem `meses` inteiro de 1 a MESES_MAXIMOS_CONTRATO, ou com inicio invalido,
 * devolve `null`. A data de fim continua um campo normal, editavel a mao: a
 * base nunca deriva nada por trigger.
 */
export function dataFimPorDuracaoMeses(dataInicio: string, meses: number): string | null {
  const inicio = lerDia(dataInicio);
  if (!inicio) return null;
  if (!Number.isInteger(meses) || meses < 1 || meses > MESES_MAXIMOS_CONTRATO) return null;

  const mesesDesdeZero = inicio.ano * 12 + (inicio.mes - 1) + meses;
  const ano = Math.floor(mesesDesdeZero / 12);
  const mes = (mesesDesdeZero % 12) + 1;
  const ultimoDia = diasDoMes(ano, mes);

  if (inicio.dia > ultimoDia) return escreverDia({ ano, mes, dia: ultimoDia });

  if (inicio.dia > 1) return escreverDia({ ano, mes, dia: inicio.dia - 1 });

  // Dia 1: a vespera e o ultimo dia do mes anterior.
  const anoAnterior = mes === 1 ? ano - 1 : ano;
  const mesAnterior = mes === 1 ? 12 : mes - 1;
  return escreverDia({
    ano: anoAnterior,
    mes: mesAnterior,
    dia: diasDoMes(anoAnterior, mesAnterior),
  });
}

/**
 * A inversa de `dataFimPorDuracaoMeses`: quantos meses (1 a
 * MESES_MAXIMOS_CONTRATO) dao exactamente esta data de fim, ou `null` se
 * nenhuma duracao em meses a produz -- uma data escrita a mao que nao bate
 * certo nao tem "meses".
 */
export function mesesExactos(dataInicio: string, dataFim: string): number | null {
  if (dataInicio.trim() === "" || dataFim.trim() === "") return null;
  for (let meses = 1; meses <= MESES_MAXIMOS_CONTRATO; meses += 1) {
    if (dataFimPorDuracaoMeses(dataInicio, meses) === dataFim.trim()) return meses;
  }
  return null;
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
