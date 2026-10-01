// Conversao de "data + HH:MM na hora local de um fuso" para um instante ISO
// (UTC). Puro e sem Deno, para ser testado com vitest. Existe porque
// `new Date("2026-09-30T13:00:00")` sem fuso e lido no fuso do servidor (UTC
// no Deno), o que desloca uma hora no verao de Lisboa.

// Hora "de parede" de `ms` no fuso `timezone`, expressa como se fosse UTC.
function wallClockAsUtcMs(ms: number, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(ms));
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? '0');
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
}

/**
 * Instante ISO em que o relogio de `timezone` marca `time` (HH:MM) no dia
 * `date` (YYYY-MM-DD). null se data ou hora forem invalidas. Corrige o desvio
 * duas vezes, para acertar tambem em dias de mudanca de hora.
 */
export function zonedLocalToIso(date: string, time: string, timezone: string): string | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(time.trim());
  if (!d || !t) return null;
  const [year, month, day] = [Number(d[1]), Number(d[2]), Number(d[3])];
  const [hour, minute, second] = [Number(t[1]), Number(t[2]), Number(t[3] ?? '0')];
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (hour > 23 || minute > 59 || second > 59) return null;

  const targetWall = Date.UTC(year, month - 1, day, hour, minute, second);
  let guess = targetWall;
  try {
    for (let i = 0; i < 2; i += 1) {
      guess = targetWall - (wallClockAsUtcMs(guess, timezone) - guess);
    }
  } catch {
    return null; // fuso invalido
  }
  return new Date(guess).toISOString();
}

/** Limites do dia local `date` no fuso `timezone`, em ISO UTC. */
export function zonedDayBounds(date: string, timezone: string): { startIso: string; endIso: string } {
  const startIso = zonedLocalToIso(date, '00:00:00', timezone) ?? `${date}T00:00:00.000Z`;
  const endIso = zonedLocalToIso(date, '23:59:59', timezone) ?? `${date}T23:59:59.000Z`;
  return { startIso, endIso };
}
