export interface LunchFields {
  lunch_window_start?: string | null;
  lunch_window_end?: string | null;
  lunch_duration_minutes?: number | null;
}

const MINUTES_PER_DAY = 24 * 60;
const MAX_LUNCH_MINUTES = 240;

function toMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = /^(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function toTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Quando dois dos três campos da pausa de almoço estão preenchidos e o terceiro
 * está vazio, devolve o valor que falta. Nunca reescreve um campo já preenchido.
 */
export function completeLunchFields(fields: LunchFields): LunchFields {
  const start = toMinutes(fields.lunch_window_start);
  const end = toMinutes(fields.lunch_window_end);
  const duration = fields.lunch_duration_minutes ?? null;
  const hasDuration = duration !== null && duration > 0;

  if (start !== null && end !== null && !hasDuration) {
    const span = end - start;
    if (span > 0 && span <= MAX_LUNCH_MINUTES) return { lunch_duration_minutes: span };
    return {};
  }
  if (start !== null && end === null && hasDuration) {
    const computedEnd = start + duration;
    if (computedEnd < MINUTES_PER_DAY) return { lunch_window_end: toTime(computedEnd) };
    return {};
  }
  if (start === null && end !== null && hasDuration) {
    const computedStart = end - duration;
    if (computedStart >= 0) return { lunch_window_start: toTime(computedStart) };
  }
  return {};
}
