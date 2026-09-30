import { describe, expect, it } from 'vitest';

// Oraculo dos horarios livres: a janela configurada (09:00-18:00, Europe/Lisbon)
// vale o ano todo. A funcao da base get_resource_available_slots tem de dar os
// mesmos inicios (em UTC) que este calculo, feito so com Intl.

const TZ = 'Europe/Lisbon';
const STEP_MIN = 30;

const fmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function localWallClock(instant: Date): string {
  const p = Object.fromEntries(fmt.formatToParts(instant).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

// Instante UTC cuja hora de parede em Lisboa e `date hh:mm`; null se a hora nao
// existe ou se repete (mudanca de hora).
function instantForLocal(date: string, hhmm: string): Date | null {
  const target = `${date} ${hhmm}`;
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = hhmm.split(':').map(Number);
  const base = Date.UTC(y, m - 1, d, hh, mm);
  const hits: Date[] = [];
  for (const offsetH of [-2, -1, 0, 1, 2]) {
    const cand = new Date(base + offsetH * 3600_000);
    if (localWallClock(cand) === target) hits.push(cand);
  }
  return hits.length === 1 ? hits[0] : null;
}

function expectedSlots(date: string, startHHMM: string, endHHMM: string, durationMin: number) {
  const windowEnd = instantForLocal(date, endHHMM);
  if (!windowEnd) throw new Error('fim da janela nao existe');
  const [sh, sm] = startHHMM.split(':').map(Number);
  const slots: { start: Date; end: Date }[] = [];
  for (let minutes = sh * 60 + sm; ; minutes += STEP_MIN) {
    const hhmm = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
    const start = instantForLocal(date, hhmm);
    if (start) {
      const end = new Date(start.getTime() + durationMin * 60_000);
      if (end > windowEnd) break;
      slots.push({ start, end });
    } else if (minutes > 24 * 60) {
      break;
    }
  }
  return slots;
}

const DAYS = ['2026-10-13', '2026-10-23', '2026-10-26', '2026-11-02', '2027-03-28', '2026-10-25'];
const DURATIONS = [60, 120];

describe('horarios livres no fuso da organizacao', () => {
  for (const date of DAYS) {
    for (const duration of DURATIONS) {
      it(`${date}, ${duration} min: primeiro inicio 09:00 locais e ultimo fim 18:00 locais`, () => {
        const slots = expectedSlots(date, '09:00', '18:00', duration);
        expect(slots.length).toBeGreaterThan(0);
        expect(localWallClock(slots[0].start).slice(11)).toBe('09:00');
        expect(localWallClock(slots[slots.length - 1].end).slice(11)).toBe('18:00');
        const lastStart = localWallClock(slots[slots.length - 1].start).slice(11);
        expect(lastStart).toBe(duration === 60 ? '17:00' : '16:00');
      });
    }
  }

  it('verao: 09:00 locais sao 08:00 UTC; inverno: 09:00 locais sao 09:00 UTC', () => {
    expect(expectedSlots('2026-10-13', '09:00', '18:00', 60)[0].start.toISOString()).toBe('2026-10-13T08:00:00.000Z');
    expect(expectedSlots('2026-11-02', '09:00', '18:00', 60)[0].start.toISOString()).toBe('2026-11-02T09:00:00.000Z');
  });

  it('hora que nao existe (2027-03-28 01:30) ou que se repete (2026-10-25 01:30) fica fora', () => {
    expect(instantForLocal('2027-03-28', '01:30')).toBeNull();
    expect(instantForLocal('2026-10-25', '01:30')).toBeNull();
  });

  it('o dia local de 2026-10-25 tem 25h e o de 2027-03-28 tem 23h', () => {
    const dayHours = (date: string, next: string) => {
      const a = instantForLocal(date, '00:00')!;
      const b = instantForLocal(next, '00:00')!;
      return (b.getTime() - a.getTime()) / 3600_000;
    };
    expect(dayHours('2026-10-25', '2026-10-26')).toBe(25);
    expect(dayHours('2027-03-28', '2027-03-29')).toBe(23);
  });
});
