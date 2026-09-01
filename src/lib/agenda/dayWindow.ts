/**
 * Janela do dia para a vista "O Meu Dia".
 *
 * `start_datetime`/`end_datetime` são `timestamptz`: o instante é absoluto, mas
 * "hoje" é uma noção LOCAL do utilizador. Por isso as fronteiras do dia são
 * calculadas na hora local do browser e só depois convertidas para ISO (UTC)
 * para irem na query. Fixar as fronteiras em UTC faria a agenda de um
 * comercial em Lisboa mudar de dia à meia-noite errada no Verão.
 */

/** Quantos dias para trás se procuram itens atrasados. */
export const OVERDUE_LOOKBACK_DAYS = 30;

export interface DayWindow {
  /** Instante do início do dia local (00:00:00.000). */
  start: Date;
  /** Instante do fim do dia local (23:59:59.999). */
  end: Date;
}

export interface AgendaQueryRange {
  fromIso: string;
  toIso: string;
}

/** Fronteiras locais do dia que contém `reference`. */
export function getDayWindow(reference: Date): DayWindow {
  const start = new Date(reference);
  start.setHours(0, 0, 0, 0);
  const end = new Date(reference);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

/**
 * Desloca uma data em dias mantendo a hora local.
 *
 * Usa `setDate`, e não aritmética de milissegundos, porque nos dias de mudança
 * de hora um "dia" não tem 24 horas — somar 86400000 saltaria ou repetiria uma
 * hora e a navegação ontem/amanhã deixaria de aterrar no dia certo.
 */
export function shiftDays(reference: Date, delta: number): Date {
  const shifted = new Date(reference);
  shifted.setDate(shifted.getDate() + delta);
  return shifted;
}

/** Verdadeiro se as duas datas caem no mesmo dia local. */
export function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Intervalo a pedir à base: recua `lookbackDays` para apanhar os atrasados e
 * termina no fim do dia visível. Uma query só, em vez de duas.
 */
export function getAgendaQueryRange(
  window: DayWindow,
  lookbackDays: number = OVERDUE_LOOKBACK_DAYS
): AgendaQueryRange {
  const from = shiftDays(window.start, -Math.abs(lookbackDays));
  from.setHours(0, 0, 0, 0);
  return { fromIso: from.toISOString(), toIso: window.end.toISOString() };
}
