/**
 * O que isto vale, com os números da empresa.
 *
 * ⚠ **Isto não calcula poupanças.** Não há aqui nenhuma promessa de que o
 * módulo faz a empresa gastar menos — não há maneira honesta de a fazer, e uma
 * calculadora que a fizesse seria uma brochura, não uma ferramenta.
 *
 * O que calcula é outra coisa, e essa é verificável: **o dinheiro que hoje não
 * está registado em lado nenhum**. Duas contas, ambas ancoradas em factos da
 * instância real do Infraspeak:
 *
 *  1. o custo de mão de obra aparece como **0,00 €** em todas as ordens, porque
 *     o campo "custo por hora" existe e nunca foi preenchido. A conta diz
 *     quanto é que isso é por ano;
 *  2. o histórico dos equipamentos está cheio de avarias que os técnicos
 *     escreveram e que nunca viraram ordem nenhuma. A conta diz quanto trabalho
 *     é isso.
 *
 * Todos os números de entrada são da empresa. Nenhum é inventado aqui — só o
 * número de dias úteis, que está à vista e se pode discutir.
 */

/** Dias úteis num ano, tirando férias e feriados. É um número redondo, e nota-se. */
export const DIAS_UTEIS = 220;

export interface Entradas {
  /** Pessoas no terreno. */
  tecnicos: number;
  /** Horas de trabalho por dia, por pessoa. */
  horasPorDia: number;
  /** Quanto custa à empresa uma hora de técnico, com encargos. */
  custoHora: number;
  /** Avarias encontradas por mês, em inspeções. */
  avariasPorMes: number;
  /** Quantas dessas se perdem, em percentagem. */
  percentagemPerdida: number;
  /** Quanto vale, em média, uma reparação. */
  valorReparacao: number;
}

export interface Valor {
  horasPorAno: number;
  /** Mão de obra que hoje não está registada em ordem nenhuma. */
  maoDeObraPorAno: number;
  avariasPerdidasPorAno: number;
  /** Trabalho que foi encontrado e nunca chegou a ser feito. */
  trabalhoPerdidoPorAno: number;
}

/** Um número que se possa usar: nunca negativo, nunca NaN. */
function sao(v: number): number {
  return Number.isFinite(v) && v > 0 ? v : 0;
}

export function calcular(e: Entradas): Valor {
  const horasPorAno = sao(e.tecnicos) * sao(e.horasPorDia) * DIAS_UTEIS;
  const perdidas = Math.min(sao(e.percentagemPerdida), 100);
  const avariasPerdidasPorAno = (sao(e.avariasPorMes) * perdidas * 12) / 100;

  return {
    horasPorAno: Math.round(horasPorAno),
    maoDeObraPorAno: Math.round(horasPorAno * sao(e.custoHora)),
    avariasPerdidasPorAno: Math.round(avariasPerdidasPorAno),
    trabalhoPerdidoPorAno: Math.round(avariasPerdidasPorAno * sao(e.valorReparacao)),
  };
}

/**
 * A conta escrita por extenso.
 *
 * É o que separa isto de um número que aparece por magia. Quem está a decidir
 * tem de poder discordar de uma parcela — e para discordar tem de a ver.
 */
export function contaDaMaoDeObra(e: Entradas): string {
  return (
    `${sao(e.tecnicos)} técnicos × ${sao(e.horasPorDia)} h × ` +
    `${DIAS_UTEIS} dias × ${sao(e.custoHora)} €/h`
  );
}

export function contaDoTrabalhoPerdido(e: Entradas): string {
  return (
    `${sao(e.avariasPorMes)} avarias/mês × ${Math.min(sao(e.percentagemPerdida), 100)}% ` +
    `× 12 meses × ${sao(e.valorReparacao)} €`
  );
}

/** Valores de partida, para o campo não estar vazio. São para mudar. */
export const PARTIDA: Entradas = {
  tecnicos: 6,
  horasPorDia: 8,
  custoHora: 18,
  avariasPorMes: 10,
  percentagemPerdida: 30,
  valorReparacao: 120,
};
