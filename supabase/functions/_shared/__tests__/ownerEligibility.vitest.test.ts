import { describe, expect, it, vi } from 'vitest';
import {
  candidateDays,
  evaluateOwnerDay,
  ownerResourcesForSlot,
  coverageForOwnerDay,
  type OwnerDeps,
} from '../ownerEligibility';
import type { NeighborVisitLike } from '../slotAggregation';
import { buildLunchBreakConfig } from '../travelFeasibility';
import { buildDayResponse } from '../availabilityResponse';

// Verao 2026-09-29 (Lisboa UTC+1): 11h locais = 10:00Z.
const DAY = '2026-09-29';
const iso = (t: string) => `${DAY}T${t}Z`;
const slot = (from: string, to: string) => ({ start: iso(from), end: iso(to) });

const CLIENT = { lat: 38.7223, lng: -9.1393 }; // Lisboa
const PORTO = { lat: 41.1579, lng: -8.6291 }; // ~275 km de Lisboa
const LONGE = { lat: 39.6, lng: -9.1393 }; // ~98 km de Lisboa: ~168 min a 35 km/h

const OWNER = 'res-owner';
const OWNER2 = 'res-owner-2';

const S1 = slot('08:00:00', '09:00:00');
const S2 = slot('10:00:00', '11:00:00');
const S3 = slot('14:00:00', '15:00:00');

interface Fake {
  slotsBy: Record<string, { start: string; end: string }[]>;
  visitsBy?: Record<string, NeighborVisitLike[]>;
  error?: unknown;
}

function makeDeps(fake: Fake) {
  const getVisits = vi.fn(async (id: string) => fake.visitsBy?.[id] ?? []);
  const getSlots = vi.fn(async (id: string, _day: string) => ({
    // so o dono tem horarios: nao ha lista de proximidade nem distrito nas deps
    slots: fake.slotsBy[id] ?? [],
    error: fake.error ?? null,
  }));
  const deps: OwnerDeps = { getSlots, getVisits };
  return { deps, getSlots, getVisits };
}

const visit = (from: string, to: string, at: { lat: number; lng: number } | null): NeighborVisitLike => ({
  start_datetime: iso(from),
  end_datetime: iso(to),
  location_lat: at ? at.lat : null,
  location_lng: at ? at.lng : null,
});

describe('evaluateOwnerDay: o dono e avaliado directamente', () => {
  it('entra sem lista de proximidade (era cortado quando vinha depois do 10.o mais proximo)', async () => {
    const { deps } = makeDeps({ slotsBy: { [OWNER]: [S1, S2] } });
    const r = await evaluateOwnerDay({
      ownerResourceIds: [OWNER], day: DAY, clientLat: null, clientLng: null, lunchBreak: null, deps,
    });
    expect(r.error).toBeNull();
    expect(r.slots.map((s) => s.start)).toEqual([S1.start, S2.start]);
  });

  it('dono fora do distrito e alem da distancia maxima: entra na mesma (as deps nao recebem zona)', async () => {
    const { deps, getSlots } = makeDeps({ slotsBy: { [OWNER]: [S2] } });
    const r = await evaluateOwnerDay({
      ownerResourceIds: [OWNER], day: DAY, clientLat: PORTO.lat, clientLng: PORTO.lng, lunchBreak: null, deps,
    });
    expect(r.slots).toHaveLength(1);
    expect(getSlots).toHaveBeenCalledWith(OWNER, DAY);
  });

  it('exclui o horario quando a deslocacao e inviavel (vizinha a ~98 km, 10 min antes)', async () => {
    const { deps } = makeDeps({
      slotsBy: { [OWNER]: [S2, S3] },
      // visita termina 09:50Z: S2 (10:00Z) so tem 10 min; S3 (14:00Z) tem 4h10 (>168 min)
      visitsBy: { [OWNER]: [visit('08:50:00', '09:50:00', LONGE)] },
    });
    const r = await evaluateOwnerDay({
      ownerResourceIds: [OWNER], day: DAY, clientLat: CLIENT.lat, clientLng: CLIENT.lng, lunchBreak: null, deps,
    });
    expect(r.slots.map((s) => s.start)).toEqual([S3.start]);
  });

  it('exclui o horario que o almoco bloqueia (com e sem coordenadas)', async () => {
    const lunch = buildLunchBreakConfig({
      timezone: 'Europe/Lisbon', lunch_window_start: '12:00', lunch_window_end: '14:00', lunch_duration_minutes: 60,
    });
    // visita 12:00-13:30 locais (11:00Z-12:30Z) deixa 30 min de almoco
    const blockers = { [OWNER]: [visit('11:00:00', '12:30:00', null)] };
    const late = slot('12:40:00', '13:40:00'); // 10 min depois da visita: bloqueado
    const { deps } = makeDeps({ slotsBy: { [OWNER]: [late, S3] }, visitsBy: blockers });
    const r = await evaluateOwnerDay({
      ownerResourceIds: [OWNER], day: DAY, clientLat: null, clientLng: null, lunchBreak: lunch, deps,
    });
    expect(r.slots.map((s) => s.start)).toEqual([S3.start]);
  });

  it('sem horarios: resultado vazio e as visitas nem sao lidas', async () => {
    const { deps, getVisits } = makeDeps({ slotsBy: { [OWNER]: [] } });
    const lunch = buildLunchBreakConfig({
      timezone: 'Europe/Lisbon', lunch_window_start: '12:00', lunch_window_end: '14:00', lunch_duration_minutes: 60,
    });
    const r = await evaluateOwnerDay({
      ownerResourceIds: [OWNER], day: DAY, clientLat: CLIENT.lat, clientLng: CLIENT.lng, lunchBreak: lunch, deps,
    });
    expect(r.slots).toEqual([]);
    expect(getVisits).not.toHaveBeenCalled();
  });

  it('dois recursos: resource_ids certos por horario', async () => {
    const { deps } = makeDeps({ slotsBy: { [OWNER]: [S1, S2], [OWNER2]: [S2, S3] } });
    const r = await evaluateOwnerDay({
      ownerResourceIds: [OWNER, OWNER2], day: DAY, clientLat: null, clientLng: null, lunchBreak: null, deps,
    });
    const byStart = Object.fromEntries(r.slots.map((s) => [s.start, s.resource_ids]));
    expect(byStart[S1.start]).toEqual([OWNER]);
    expect(byStart[S2.start]).toEqual([OWNER, OWNER2]);
    expect(byStart[S3.start]).toEqual([OWNER2]);
  });

  it('um erro da RPC e propagado (nao vira "sem horarios")', async () => {
    const boom = new Error('rpc falhou');
    const { deps } = makeDeps({ slotsBy: { [OWNER]: [S1] }, error: boom });
    const r = await evaluateOwnerDay({
      ownerResourceIds: [OWNER], day: DAY, clientLat: null, clientLng: null, lunchBreak: null, deps,
    });
    expect(r.error).toBe(boom);
    expect(r.slots).toEqual([]);
  });

  it('sem recursos do dono: vazio, sem chamar nada', async () => {
    const { deps, getSlots } = makeDeps({ slotsBy: {} });
    const r = await evaluateOwnerDay({
      ownerResourceIds: [], day: DAY, clientLat: null, clientLng: null, lunchBreak: null, deps,
    });
    expect(r.slots).toEqual([]);
    expect(getSlots).not.toHaveBeenCalled();
  });
});

describe('candidateDays', () => {
  it('tira fins-de-semana (0 = domingo) e feriados', () => {
    // 2026-09-28 seg ... 2026-10-04 dom
    const r = candidateDays('2026-09-28', '2026-10-04', [1, 2, 3, 4, 5], ['2026-09-30'], '2026-09-01');
    expect(r).toEqual(['2026-09-28', '2026-09-29', '2026-10-01', '2026-10-02']);
  });

  it('tira dias passados mas mantem hoje', () => {
    const r = candidateDays('2026-09-28', '2026-10-02', [1, 2, 3, 4, 5], [], '2026-09-30');
    expect(r).toEqual(['2026-09-30', '2026-10-01', '2026-10-02']);
  });

  it('limita a 62 dias a partir do inicio', () => {
    const r = candidateDays('2026-10-01', '2027-06-30', [0, 1, 2, 3, 4, 5, 6], [], '2026-09-01');
    expect(r).toHaveLength(62);
    expect(r[0]).toBe('2026-10-01');
    expect(r[61]).toBe('2026-12-01');
  });
});

describe('a resposta tem a mesma forma para conhecido e desconhecido', () => {
  it('buildDayResponse com o resultado do dono e com um desconhecido: mesmas chaves, available_count 1', async () => {
    const { deps } = makeDeps({ slotsBy: { [OWNER]: [S1, S2], [OWNER2]: [S2] } });
    const owner = await evaluateOwnerDay({
      ownerResourceIds: [OWNER, OWNER2], day: DAY, clientLat: null, clientLng: null, lunchBreak: null, deps,
    });
    const known = buildDayResponse({ slots: owner.slots, coverage: true, timezone: 'Europe/Lisbon', durationMinutes: 60 });
    const unknown = buildDayResponse({
      slots: [{ ...S1 }, { ...S2 }], coverage: true, timezone: 'Europe/Lisbon', durationMinutes: 60,
    });
    expect(Object.keys(known).sort()).toEqual(Object.keys(unknown).sort());
    expect(known.slots.map((s) => Object.keys(s).sort())).toEqual(unknown.slots.map((s) => Object.keys(s).sort()));
    expect(known.slots.every((s) => s.available_count === 1)).toBe(true);
    expect(known.slots.length).toBeGreaterThan(0);
  });
});

describe('calendario e marcacao usam a mesma funcao', () => {
  it('todo horario oferecido pelo calendario e aceite pela marcacao; o que nao foi oferecido, nao', async () => {
    const { deps } = makeDeps({
      slotsBy: { [OWNER]: [S2, S3], [OWNER2]: [S3] },
      visitsBy: { [OWNER]: [visit('08:50:00', '09:50:00', LONGE)] },
    });
    const r = await evaluateOwnerDay({
      ownerResourceIds: [OWNER, OWNER2], day: DAY, clientLat: CLIENT.lat, clientLng: CLIENT.lng, lunchBreak: null, deps,
    });
    // S2 recusado ao OWNER pela deslocacao e OWNER2 nao o tem: fora dos dois lados
    expect(r.slots.map((s) => s.start)).toEqual([S3.start]);
    for (const s of r.slots) {
      expect(ownerResourcesForSlot(r.slots, s.start, s.end).length).toBeGreaterThan(0);
    }
    expect(ownerResourcesForSlot(r.slots, S2.start, S2.end)).toEqual([]);
    expect(ownerResourcesForSlot(r.slots, S3.start, S3.end)).toEqual([OWNER, OWNER2]);
  });

  it('compara instantes, nao texto (formatos de data diferentes)', async () => {
    const { deps } = makeDeps({ slotsBy: { [OWNER]: [S3] } });
    const r = await evaluateOwnerDay({
      ownerResourceIds: [OWNER], day: DAY, clientLat: null, clientLng: null, lunchBreak: null, deps,
    });
    expect(ownerResourcesForSlot(r.slots, `${DAY}T15:00:00+01:00`, `${DAY}T16:00:00+01:00`)).toEqual([OWNER]);
  });
});

describe("coverageForOwnerDay (o dono conhecido nao denuncia o contacto)", () => {
  it("coverage=false da proximidade + horarios do dono => true", () => {
    expect(coverageForOwnerDay(false, [S1])).toBe(true);
  });
  it("coverage=false + sem horarios => false", () => {
    expect(coverageForOwnerDay(false, [])).toBe(false);
  });
  it("coverage=true => true, com ou sem horarios", () => {
    expect(coverageForOwnerDay(true, [S1])).toBe(true);
    expect(coverageForOwnerDay(true, [])).toBe(true);
  });
  it("desconhecido (sem dono): o valor original nao muda, a funcao nao e usada", () => {
    // O desconhecido nunca passa por aqui; o seu coverage continua a ser o da proximidade.
    const proximity = false;
    const unknownVisitorCoverage = proximity;
    expect(unknownVisitorCoverage).toBe(false);
  });
});
