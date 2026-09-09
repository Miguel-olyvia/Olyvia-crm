/**
 * As horas de trabalho contratadas, e a unica unidade em que se podem comparar.
 *
 * PORQUE ISTO EXISTE
 * ------------------
 * `pessoas_vinculos` guarda uma QUANTIDADE (`horas_periodo`) e uma UNIDADE
 * (`horas_frequencia`). Duas linhas com o mesmo numero podem significar coisas
 * diferentes -- 40 por semana e 40 por mes. Comparar quantidades cruas e
 * comparar grandezas diferentes, e foi por isso que a base passou a ter uma
 * coluna gerada, `horas_semanais_equivalentes`, com o tecto de 80h.
 *
 * Os factores aqui sao OS MESMOS que a migration 20261120190000 escreveu no
 * `CASE` da coluna gerada. Se um lado mudar sem o outro, o ecra valida contra
 * um limite que a base nao tem -- ou pior, deixa passar o que ela recusa. Sao
 * convencoes, nao medicoes: uma semana tem 5 dias uteis e um ano 52 semanas.
 */
import type { HorasFrequencia } from "@/types/hr";

/** Quantas semanas vale uma unidade de cada frequencia. */
export const FACTOR_SEMANAL: Readonly<Record<HorasFrequencia, number>> = {
  diaria: 5,
  semanal: 1,
  mensal: 3 / 13,
  anual: 1 / 52,
};

/** O tecto da base, em horas por semana equivalentes. */
export const TECTO_SEMANAL_EQUIVALENTE = 80;

/**
 * A faixa dentro da qual um contrato e plausivel, em horas por semana.
 *
 * E UMA HEURISTICA, E VALE A PENA SER HONESTO SOBRE OS SEUS LIMITES.
 * Nenhuma regra consegue distinguir "40 por mes" mal escolhido de um contrato
 * real de 9,2h por semana: as duas linhas sao IDENTICAS e ambas sao legais.
 * Foi por isso que o tecto da base passou a ser sobre o equivalente semanal e
 * nao quatro intervalos por unidade -- o intervalo por unidade nunca apanharia
 * a unidade trocada.
 *
 * O que este aviso faz e outra coisa: assinala o que e invulgar, para quem
 * preenche confirmar. 40 por mes da 9,2h/semana e cai aqui; um contrato
 * genuino de 9h/semana TAMBEM cai, e e aceitavel que caia -- e um aviso, nao
 * uma recusa, e a alternativa era nao avisar de nada.
 *
 * 48h e o limite de referencia da directiva europeia do tempo de trabalho;
 * 10h e o ponto abaixo do qual um contrato deixa de ser corrente.
 */
export const FAIXA_PLAUSIVEL_SEMANAL = { min: 10, max: 48 } as const;

/**
 * A quantidade convertida para horas por semana, como a base a calcula.
 *
 * Devolve `null` quando nao ha quantidade -- e nao zero: ausencia de horas
 * contratadas nao e um contrato de zero horas.
 */
export function equivalenteSemanal(
  horas: number | null,
  frequencia: HorasFrequencia,
): number | null {
  if (horas === null || !Number.isFinite(horas)) return null;
  return horas * FACTOR_SEMANAL[frequencia];
}

/**
 * O maximo que um campo de horas pode aceitar NA UNIDADE ESCOLHIDA.
 *
 * E o tecto de 80h/semana dividido pelo factor: 16 por dia, 80 por semana,
 * 346,67 por mes, 4160 por ano. Nao se escrevem a mao em sitio nenhum -- eram
 * quatro numeros por manter em sincronia com um CHECK.
 */
export function maximoDaFrequencia(frequencia: HorasFrequencia): number {
  return TECTO_SEMANAL_EQUIVALENTE / FACTOR_SEMANAL[frequencia];
}

/** O equivalente semanal excede o tecto da base? */
export function horasAcimaDoTecto(horas: number | null, frequencia: HorasFrequencia): boolean {
  const equivalente = equivalenteSemanal(horas, frequencia);
  return equivalente !== null && equivalente > TECTO_SEMANAL_EQUIVALENTE;
}

/**
 * O equivalente e legal mas improvavel? E o sinal de unidade trocada.
 *
 * "40 mensais" da 9,2h/semana -- passa o tecto e nao passa isto.
 */
export function horasImplausiveis(horas: number | null, frequencia: HorasFrequencia): boolean {
  const equivalente = equivalenteSemanal(horas, frequencia);
  if (equivalente === null || equivalente === 0) return false;
  if (equivalente > TECTO_SEMANAL_EQUIVALENTE) return false;
  return (
    equivalente < FAIXA_PLAUSIVEL_SEMANAL.min || equivalente > FAIXA_PLAUSIVEL_SEMANAL.max
  );
}

/** Uma casa decimal, para mostrar o equivalente sem 9,230769230769231. */
export function equivalenteParaMostrar(
  horas: number | null,
  frequencia: HorasFrequencia,
): string | null {
  const equivalente = equivalenteSemanal(horas, frequencia);
  if (equivalente === null) return null;
  return (Math.round(equivalente * 10) / 10).toLocaleString("pt-PT");
}
