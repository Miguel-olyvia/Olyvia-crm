import { describe, expect, it } from 'vitest';
import {
  checkTravelFeasible,
  buildLunchBreakConfig,
  endsInsideLunchWindow,
  freeLunchMinutes,
  lunchWindowBounds,
  requiredTravelMinutes,
} from '../travelFeasibility';
import { haversineKm } from '../distance';

// Fuso Europe/Lisbon, dia de Verao 2026-09-29 (UTC+1): 11h locais = 10:00Z, 13h locais = 12:00Z.
const DAY = '2026-09-29';
const iso = (utcTime: string) => `${DAY}T${utcTime}Z`;

const A = { lat: 38.7223, lng: -9.1393 };
const B = { lat: 38.8266, lng: -9.1393 };

const LUNCH = buildLunchBreakConfig({
  timezone: 'Europe/Lisbon',
  lunch_window_start: '12:00:00',
  lunch_window_end: '13:00:00',
  lunch_duration_minutes: 60,
})!;

describe('distancia A-B (fixture determinista)', () => {
  it('fica entre 19.5 e 20 minutos de deslocacao a 35 km/h', () => {
    const minutes = requiredTravelMinutes(haversineKm(A.lat, A.lng, B.lat, B.lng));
    expect(minutes).toBeGreaterThan(19.5);
    expect(minutes).toBeLessThan(20);
  });
});

describe('checkTravelFeasible - sem almoco, igual a hoje', () => {
  it('feasible com lunchBreak ausente e com null', () => {
    const neighbors = [
      { start_datetime: iso('10:00:00'), end_datetime: iso('12:00:00'), location_lat: A.lat, location_lng: A.lng },
    ];
    const paramsBase = {
      clientLat: A.lat,
      clientLng: A.lng,
      slotStart: iso('12:00:00'),
      slotEnd: iso('13:00:00'),
      neighbors,
    };
    expect(checkTravelFeasible(paramsBase).feasible).toBe(true);
    expect(checkTravelFeasible({ ...paramsBase, lunchBreak: null }).feasible).toBe(true);
  });

  it('cliente sem coordenadas e sem almoco: sempre feasible', () => {
    const result = checkTravelFeasible({
      clientLat: null,
      clientLng: null,
      slotStart: iso('12:00:00'),
      slotEnd: iso('13:00:00'),
      neighbors: [],
    });
    expect(result.feasible).toBe(true);
  });
});

describe('checkTravelFeasible - visita e janela terminam no mesmo instante', () => {
  const neighbors = [
    { start_datetime: iso('10:00:00'), end_datetime: iso('12:00:00'), location_lat: A.lat, location_lng: A.lng },
  ];
  const base = { clientLat: A.lat, clientLng: A.lng, neighbors, lunchBreak: LUNCH };

  it('13h00 infeasible', () => {
    const r = checkTravelFeasible({ ...base, slotStart: iso('12:00:00'), slotEnd: iso('13:30:00') });
    expect(r.feasible).toBe(false);
  });

  it('13h59 infeasible', () => {
    const r = checkTravelFeasible({ ...base, slotStart: iso('12:59:00'), slotEnd: iso('13:59:00') });
    expect(r.feasible).toBe(false);
  });

  it('14h00 feasible', () => {
    const r = checkTravelFeasible({ ...base, slotStart: iso('13:00:00'), slotEnd: iso('14:00:00') });
    expect(r.feasible).toBe(true);
  });
});

describe('checkTravelFeasible - exemplo do utilizador', () => {
  const neighbors = [
    { start_datetime: iso('10:00:00'), end_datetime: iso('12:00:00'), location_lat: B.lat, location_lng: B.lng },
  ];
  const base = { clientLat: A.lat, clientLng: A.lng, neighbors, lunchBreak: LUNCH };

  it('14h19 infeasible', () => {
    const r = checkTravelFeasible({ ...base, slotStart: iso('13:19:00'), slotEnd: iso('13:19:00') });
    expect(r.feasible).toBe(false);
  });

  it('14h20 feasible', () => {
    const r = checkTravelFeasible({ ...base, slotStart: iso('13:20:00'), slotEnd: iso('13:20:00') });
    expect(r.feasible).toBe(true);
  });
});

describe('checkTravelFeasible - termina fora da janela', () => {
  const neighbors = [
    { start_datetime: iso('09:00:00'), end_datetime: iso('10:30:00'), location_lat: B.lat, location_lng: B.lng },
  ];
  const base = { clientLat: A.lat, clientLng: A.lng, neighbors, lunchBreak: LUNCH };

  it('11h50 feasible (so deslocacao, ~19.9min)', () => {
    const r = checkTravelFeasible({ ...base, slotStart: iso('10:50:00'), slotEnd: iso('10:50:00') });
    expect(r.feasible).toBe(true);
  });

  it('11h45 infeasible', () => {
    const r = checkTravelFeasible({ ...base, slotStart: iso('10:45:00'), slotEnd: iso('10:45:00') });
    expect(r.feasible).toBe(false);
  });
});

describe('checkTravelFeasible - termina no inicio da janela (extremo incluido)', () => {
  const neighbors = [
    { start_datetime: iso('10:00:00'), end_datetime: iso('11:00:00'), location_lat: A.lat, location_lng: A.lng },
  ];
  const base = { clientLat: A.lat, clientLng: A.lng, neighbors, lunchBreak: LUNCH };

  it('12h59 infeasible', () => {
    const r = checkTravelFeasible({ ...base, slotStart: iso('11:59:00'), slotEnd: iso('11:59:00') });
    expect(r.feasible).toBe(false);
  });

  it('13h00 feasible', () => {
    const r = checkTravelFeasible({ ...base, slotStart: iso('12:00:00'), slotEnd: iso('12:00:00') });
    expect(r.feasible).toBe(true);
  });
});

describe('checkTravelFeasible - cliente sem coordenadas, com almoco', () => {
  const neighbors = [
    { start_datetime: iso('10:00:00'), end_datetime: iso('12:00:00'), location_lat: null, location_lng: null },
  ];
  const base = { clientLat: null, clientLng: null, neighbors, lunchBreak: LUNCH };

  it('13h30 infeasible', () => {
    const r = checkTravelFeasible({ ...base, slotStart: iso('12:30:00'), slotEnd: iso('12:30:00') });
    expect(r.feasible).toBe(false);
  });

  it('14h00 feasible (deslocacao conta 0)', () => {
    const r = checkTravelFeasible({ ...base, slotStart: iso('13:00:00'), slotEnd: iso('13:00:00') });
    expect(r.feasible).toBe(true);
  });
});

describe('checkTravelFeasible - vizinha anterior sem coordenadas, cliente com coordenadas', () => {
  const neighbors = [
    { start_datetime: iso('10:00:00'), end_datetime: iso('12:00:00'), location_lat: null, location_lng: null },
  ];
  const base = { clientLat: A.lat, clientLng: A.lng, neighbors, lunchBreak: LUNCH };

  it('13h30 infeasible', () => {
    const r = checkTravelFeasible({ ...base, slotStart: iso('12:30:00'), slotEnd: iso('12:30:00') });
    expect(r.feasible).toBe(false);
  });

  it('14h00 feasible', () => {
    const r = checkTravelFeasible({ ...base, slotStart: iso('13:00:00'), slotEnd: iso('13:00:00') });
    expect(r.feasible).toBe(true);
  });
});

describe('checkTravelFeasible - lado seguinte', () => {
  it('candidato 11h-13h com vizinha seguinte em A: 13h30 infeasible, 14h00 feasible', () => {
    const neighbors = [
      { start_datetime: iso('12:30:00'), end_datetime: iso('13:00:00'), location_lat: A.lat, location_lng: A.lng },
    ];
    const base = {
      clientLat: A.lat,
      clientLng: A.lng,
      slotStart: iso('10:00:00'),
      slotEnd: iso('12:00:00'),
      neighbors,
      lunchBreak: LUNCH,
    };
    expect(checkTravelFeasible(base).feasible).toBe(false);

    const neighborsLater = [
      { start_datetime: iso('13:00:00'), end_datetime: iso('13:30:00'), location_lat: A.lat, location_lng: A.lng },
    ];
    expect(checkTravelFeasible({ ...base, neighbors: neighborsLater }).feasible).toBe(true);
  });

  it('candidato 10h-11h e vizinha as 11h00 em A: feasible (termina fora da janela)', () => {
    const neighbors = [
      { start_datetime: iso('10:00:00'), end_datetime: iso('10:20:00'), location_lat: A.lat, location_lng: A.lng },
    ];
    const r = checkTravelFeasible({
      clientLat: A.lat,
      clientLng: A.lng,
      slotStart: iso('09:00:00'),
      slotEnd: iso('10:00:00'),
      neighbors,
      lunchBreak: LUNCH,
    });
    expect(r.feasible).toBe(true);
  });
});

describe('checkTravelFeasible - fuso horario', () => {
  it('12:00Z em 2026-09-29 sao 13h locais (dentro da janela)', () => {
    const neighbors = [
      { start_datetime: iso('10:00:00'), end_datetime: iso('12:00:00'), location_lat: A.lat, location_lng: A.lng },
    ];
    const r = checkTravelFeasible({
      clientLat: A.lat,
      clientLng: A.lng,
      slotStart: iso('12:00:00'),
      slotEnd: iso('12:30:00'),
      neighbors,
      lunchBreak: LUNCH,
    });
    expect(r.feasible).toBe(false);
  });

  it('13:00Z em 2026-09-29 sao 14h locais (fora da janela)', () => {
    const neighbors = [
      { start_datetime: iso('12:00:00'), end_datetime: iso('13:00:00'), location_lat: A.lat, location_lng: A.lng },
    ];
    const r = checkTravelFeasible({
      clientLat: A.lat,
      clientLng: A.lng,
      slotStart: iso('13:00:00'),
      slotEnd: iso('13:00:00'),
      neighbors,
      lunchBreak: LUNCH,
    });
    expect(r.feasible).toBe(true);
  });

  it('Inverno 2026-01-13, vizinha termina as 13:00Z, que sao 13h locais (dentro da janela)', () => {
    const winterIso = (utcTime: string) => `2026-01-13T${utcTime}Z`;
    const neighbors = [
      { start_datetime: winterIso('11:00:00'), end_datetime: winterIso('13:00:00'), location_lat: A.lat, location_lng: A.lng },
    ];
    const r = checkTravelFeasible({
      clientLat: A.lat,
      clientLng: A.lng,
      slotStart: winterIso('13:20:00'),
      slotEnd: winterIso('13:20:00'),
      neighbors,
      lunchBreak: LUNCH,
    });
    expect(r.feasible).toBe(false);
  });
});

describe('buildLunchBreakConfig', () => {
  it('null/undefined dao null', () => {
    expect(buildLunchBreakConfig(null)).toBeNull();
    expect(buildLunchBreakConfig(undefined)).toBeNull();
  });

  it('um campo em falta da null', () => {
    expect(
      buildLunchBreakConfig({ timezone: 'Europe/Lisbon', lunch_window_start: '12:00', lunch_window_end: '13:00', lunch_duration_minutes: null }),
    ).toBeNull();
    expect(
      buildLunchBreakConfig({ timezone: 'Europe/Lisbon', lunch_window_start: null, lunch_window_end: '13:00', lunch_duration_minutes: 60 }),
    ).toBeNull();
  });

  it('inicio igual ou posterior ao fim da null', () => {
    expect(
      buildLunchBreakConfig({ timezone: 'Europe/Lisbon', lunch_window_start: '13:00', lunch_window_end: '13:00', lunch_duration_minutes: 60 }),
    ).toBeNull();
    expect(
      buildLunchBreakConfig({ timezone: 'Europe/Lisbon', lunch_window_start: '14:00', lunch_window_end: '13:00', lunch_duration_minutes: 60 }),
    ).toBeNull();
  });

  it('duracao 0 da null', () => {
    expect(
      buildLunchBreakConfig({ timezone: 'Europe/Lisbon', lunch_window_start: '12:00', lunch_window_end: '13:00', lunch_duration_minutes: 0 }),
    ).toBeNull();
  });

  it("'12:00' e '12:00:00' dao windowStartMin 720", () => {
    const cfg1 = buildLunchBreakConfig({ timezone: 'Europe/Lisbon', lunch_window_start: '12:00', lunch_window_end: '13:00', lunch_duration_minutes: 60 });
    const cfg2 = buildLunchBreakConfig({ timezone: 'Europe/Lisbon', lunch_window_start: '12:00:00', lunch_window_end: '13:00:00', lunch_duration_minutes: 60 });
    expect(cfg1?.windowStartMin).toBe(720);
    expect(cfg2?.windowStartMin).toBe(720);
  });

  it('timezone nulo passa a Europe/Lisbon', () => {
    const cfg = buildLunchBreakConfig({ timezone: null, lunch_window_start: '12:00', lunch_window_end: '13:00', lunch_duration_minutes: 60 });
    expect(cfg?.timezone).toBe('Europe/Lisbon');
  });
});

describe('endsInsideLunchWindow', () => {
  it('extremos incluidos', () => {
    expect(endsInsideLunchWindow(iso('11:00:00'), LUNCH)).toBe(true); // 12h00 local
    expect(endsInsideLunchWindow(iso('12:00:00'), LUNCH)).toBe(true); // 13h00 local
    expect(endsInsideLunchWindow(iso('12:01:00'), LUNCH)).toBe(false); // 13h01 local
    expect(endsInsideLunchWindow(iso('10:59:00'), LUNCH)).toBe(false); // 11h59 local
  });
});

// ---------------------------------------------------------------------------
// Regra B (29/09): visitas que ocupam a janela sem deixar o almoco livre
// atrasam a marcacao seguinte para fim + deslocacao + almoco.
// Horas locais Lisboa (UTC+1): local HH:MM = (HH-1):MM Z.
// ---------------------------------------------------------------------------
describe('checkTravelFeasible - almoco nao livre na janela (Regra B)', () => {
  const V = { lat: 38.7078, lng: -9.1366 };
  // ~8,5 min de deslocacao (a 35 km/h) de V.
  const NEAR = { lat: 38.7078 + 0.0446, lng: -9.1366 };
  const visit = (from: string, to: string, at = V) => ({
    start_datetime: iso(from),
    end_datetime: iso(to),
    location_lat: at.lat,
    location_lng: at.lng,
  });
  const run = (
    neighbors: ReturnType<typeof visit>[],
    from: string,
    to: string,
    client: { lat: number; lng: number } | null,
    lunchBreak: typeof LUNCH | null = LUNCH,
  ) =>
    checkTravelFeasible({
      clientLat: client ? client.lat : null,
      clientLng: client ? client.lng : null,
      slotStart: iso(from),
      slotEnd: iso(to),
      neighbors,
      lunchBreak,
    });

  it('a deslocacao de referencia ronda 8,5 min', () => {
    const minutes = requiredTravelMinutes(haversineKm(V.lat, V.lng, NEAR.lat, NEAR.lng));
    expect(minutes).toBeGreaterThan(8.3);
    expect(minutes).toBeLessThan(8.7);
  });

  it('1: visita 12-14, candidato 14:30 e 15:00 (desloc. 8,5) recusam', () => {
    const n = [visit('11:00:00', '13:00:00')];
    expect(run(n, '13:30:00', '15:30:00', NEAR).feasible).toBe(false);
    expect(run(n, '14:00:00', '16:00:00', NEAR).feasible).toBe(false);
  });

  it('2: visita 12-14, candidato 15:30 (desloc. 8,5) aceita', () => {
    const n = [visit('11:00:00', '13:00:00')];
    expect(run(n, '14:30:00', '16:30:00', NEAR).feasible).toBe(true);
  });

  it('3: visita 12-14, desloc. 0: 15:00 aceita, 14:30 recusa', () => {
    const n = [visit('11:00:00', '13:00:00')];
    expect(run(n, '14:00:00', '16:00:00', V).feasible).toBe(true);
    expect(run(n, '13:30:00', '15:30:00', V).feasible).toBe(false);
  });

  it('4 (controlo): visitas 09-12 e 13-15 deixam 60 min livres, 15:30 aceita', () => {
    const n = [visit('08:00:00', '11:00:00'), visit('12:00:00', '14:00:00')];
    expect(run(n, '14:30:00', '16:30:00', NEAR).feasible).toBe(true);
  });

  it('5: visitas 11:30-12:30 e 12:30-14:00, candidato 14:30 (desloc. 0) recusa', () => {
    const n = [visit('10:30:00', '11:30:00'), visit('11:30:00', '13:00:00')];
    expect(run(n, '13:30:00', '15:30:00', V).feasible).toBe(false);
  });

  it('6: visita 14-16, candidato 11-13 (e o ultimo a tocar a janela) recusa', () => {
    const n = [visit('13:00:00', '15:00:00')];
    expect(run(n, '10:00:00', '12:00:00', NEAR).feasible).toBe(false);
  });

  it('7: visita 14:30-16, candidato 11-13 (desloc. 0) aceita, 90 >= 60', () => {
    const n = [visit('13:30:00', '15:00:00')];
    expect(run(n, '10:00:00', '12:00:00', V).feasible).toBe(true);
  });

  it('8: visita 12-14 nao atrasa o candidato das 09:00', () => {
    const n = [visit('11:00:00', '13:00:00')];
    expect(run(n, '08:00:00', '10:00:00', NEAR).feasible).toBe(true);
  });

  it('9: visita de outro dia a cobrir a janela nao conta', () => {
    const other = {
      start_datetime: '2026-09-28T11:00:00Z',
      end_datetime: '2026-09-28T13:00:00Z',
      location_lat: V.lat,
      location_lng: V.lng,
    };
    expect(run([other], '13:30:00', '15:30:00', NEAR).feasible).toBe(true);
  });

  it('10: sem config de almoco nada muda', () => {
    const n = [visit('11:00:00', '13:00:00')];
    expect(run(n, '13:30:00', '15:30:00', NEAR, null).feasible).toBe(true);
  });

  it('11: visita 10:00-12:30, candidato 13:00 (desloc. 0) recusa', () => {
    const n = [visit('09:00:00', '11:30:00')];
    expect(run(n, '12:00:00', '14:00:00', V).feasible).toBe(false);
  });

  it('sem coordenadas no cliente a regra aplica-se com deslocacao 0', () => {
    const n = [visit('11:00:00', '13:00:00')];
    expect(run(n, '13:30:00', '15:30:00', null).feasible).toBe(false);
    expect(run(n, '14:00:00', '16:00:00', null).feasible).toBe(true);
  });
});

describe('lunchWindowBounds e freeLunchMinutes', () => {
  it('a janela 12-13 de Lisboa em Setembro e 11:00Z-12:00Z', () => {
    const b = lunchWindowBounds(iso('14:00:00'), LUNCH);
    expect(new Date(b.startMs).toISOString()).toBe('2026-09-29T11:00:00.000Z');
    expect(new Date(b.endMs).toISOString()).toBe('2026-09-29T12:00:00.000Z');
  });

  it('a janela em Inverno usa o desvio de Inverno (UTC+0)', () => {
    const b = lunchWindowBounds('2026-12-10T15:00:00Z', LUNCH);
    expect(new Date(b.startMs).toISOString()).toBe('2026-12-10T12:00:00.000Z');
  });

  it('une visitas sobrepostas e ignora as que nao tocam a janela', () => {
    const w = { startMs: 0, endMs: 60 * 60000 };
    const m = (a: number, b: number) => ({ startMs: a * 60000, endMs: b * 60000 });
    expect(freeLunchMinutes([], w)).toBe(60);
    expect(freeLunchMinutes([m(-30, 20), m(10, 30)], w)).toBe(30);
    expect(freeLunchMinutes([m(60, 120), m(-60, 0)], w)).toBe(60);
    expect(freeLunchMinutes([m(0, 20), m(40, 60)], w)).toBe(20);
  });
});
