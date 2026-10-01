import { describe, expect, it } from 'vitest';
import {
  aggregateDayWithoutPostal,
  aggregateFeasibleSlots,
  intersectMonthDays,
  restrictResourcesToOwner,
  type CandidateResource,
  type NeighborVisitLike,
} from '../slotAggregation';
import { buildLunchBreakConfig } from '../travelFeasibility';
import { buildDayResponse, buildMonthResponse, PUBLIC_AVAILABLE_COUNT } from '../availabilityResponse';

// Fuso Europe/Lisbon, dia de Verao 2026-09-29 (UTC+1): 11h locais = 10:00Z.
const DAY = '2026-09-29';
const iso = (t: string) => `${DAY}T${t}Z`;
const slot = (from: string, to: string) => ({ start: iso(from), end: iso(to) });

// Lisboa (cliente) e ponto ~20 km a norte (visita vizinha distante).
const CLIENT = { lat: 38.7223, lng: -9.1393 };
const FAR = { lat: 38.9023, lng: -9.1393 }; // ~20 km => ~34 min a 35 km/h

const OWNER = 'res-owner';
const OTHER = 'res-other';

const DAY_SLOTS = [
  slot('08:00:00', '09:00:00'),
  slot('09:00:00', '10:00:00'),
  slot('10:00:00', '11:00:00'),
  slot('11:00:00', '12:00:00'),
  slot('13:00:00', '14:00:00'),
];

const resources: CandidateResource[] = [
  { resource_id: OTHER, available_slots: DAY_SLOTS },
  { resource_id: OWNER, available_slots: DAY_SLOTS },
];

const noNeighbors = new Map<string, NeighborVisitLike[]>();
const keys = (s: { start: string; end: string }[]) => s.map((x) => `${x.start}|${x.end}`);

const base = {
  resources,
  neighborsByResource: noNeighbors,
  clientLat: CLIENT.lat,
  clientLng: CLIENT.lng,
  lunchBreak: null,
};

describe('restrictResourcesToOwner', () => {
  it('sem restricao devolve todos; com restricao so os do dono', () => {
    expect(restrictResourcesToOwner(resources, null)).toHaveLength(2);
    expect(restrictResourcesToOwner(resources, [])).toHaveLength(2);
    expect(restrictResourcesToOwner(resources, [OWNER]).map((r) => r.resource_id)).toEqual([OWNER]);
  });

  it('id do dono que nao esta nos candidatos NAO cria recurso: fica vazio', () => {
    expect(restrictResourcesToOwner(resources, ['res-fantasma'])).toEqual([]);
  });
});

describe('aggregateFeasibleSlots - o filtro do dono nunca acrescenta', () => {
  it('restrito e SUBCONJUNTO do nao restrito, e so com recursos do dono', () => {
    const all = aggregateFeasibleSlots({ ...base, ownerResourceIds: null });
    const own = aggregateFeasibleSlots({ ...base, ownerResourceIds: [OWNER] });
    const allKeys = new Set(keys(all));
    expect(own.length).toBeGreaterThan(0);
    for (const k of keys(own)) expect(allKeys.has(k)).toBe(true);
    for (const s of own) expect(s.resource_ids).toEqual([OWNER]);
  });

  it('subconjunto ESTRITO quando o dono tem menos horarios que os outros', () => {
    const rs: CandidateResource[] = [
      { resource_id: OTHER, available_slots: DAY_SLOTS },
      { resource_id: OWNER, available_slots: DAY_SLOTS.slice(0, 2) },
    ];
    const all = aggregateFeasibleSlots({ ...base, resources: rs, ownerResourceIds: null });
    const own = aggregateFeasibleSlots({ ...base, resources: rs, ownerResourceIds: [OWNER] });
    expect(own.length).toBe(2);
    expect(all.length).toBe(DAY_SLOTS.length);
    expect(own.length).toBeLessThan(all.length);
  });

  it('dono que nao esta entre os candidatos (nao cobre o distrito): calendario vazio, nunca cai noutro tecnico', () => {
    const rs: CandidateResource[] = [{ resource_id: OTHER, available_slots: DAY_SLOTS }];
    expect(aggregateFeasibleSlots({ ...base, resources: rs, ownerResourceIds: [OWNER] })).toEqual([]);
  });

  it('horarios de outro recurso nao entram no restrito', () => {
    const rs: CandidateResource[] = [
      { resource_id: OTHER, available_slots: [slot('08:00:00', '09:00:00')] },
      { resource_id: OWNER, available_slots: [slot('09:00:00', '10:00:00')] },
    ];
    const own = aggregateFeasibleSlots({ ...base, resources: rs, ownerResourceIds: [OWNER] });
    expect(keys(own)).toEqual([`${iso('09:00:00')}|${iso('10:00:00')}`]);
  });
});

describe('aggregateFeasibleSlots - a regra 13 continua a aplicar-se ao recurso do dono', () => {
  it('visita vizinha distante torna inviavel o horario do dono, mesmo restrito', () => {
    // O dono tem uma visita que termina as 10:00Z numa morada a ~20 km: o horario
    // das 10:00Z (folga 0 min) e o das 10:15Z nao dao tempo de deslocacao.
    const neighbors = new Map<string, NeighborVisitLike[]>([
      [OWNER, [{ start_datetime: iso('09:00:00'), end_datetime: iso('10:00:00'), location_lat: FAR.lat, location_lng: FAR.lng }]],
    ]);
    const rs: CandidateResource[] = [
      { resource_id: OWNER, available_slots: [slot('10:00:00', '11:00:00'), slot('11:00:00', '12:00:00')] },
    ];
    const restricted = aggregateFeasibleSlots({ ...base, resources: rs, ownerResourceIds: [OWNER], neighborsByResource: neighbors });
    // 10:00Z-11:00Z: folga 0 < ~34 min => sai. 11:00Z: folga 60 min >= 34 => fica.
    expect(keys(restricted)).toEqual([`${iso('11:00:00')}|${iso('12:00:00')}`]);

    // Prova de que sem a regra o horario existia (a regra e que o tira).
    const semRegra = aggregateFeasibleSlots({ ...base, resources: rs, ownerResourceIds: [OWNER], clientLat: null, clientLng: null });
    expect(keys(semRegra)).toContain(`${iso('10:00:00')}|${iso('11:00:00')}`);
  });

  it('o resultado restrito com deslocacao continua contido no nao restrito', () => {
    const neighbors = new Map<string, NeighborVisitLike[]>([
      [OWNER, [{ start_datetime: iso('09:00:00'), end_datetime: iso('10:00:00'), location_lat: FAR.lat, location_lng: FAR.lng }]],
    ]);
    const all = aggregateFeasibleSlots({ ...base, ownerResourceIds: null, neighborsByResource: neighbors });
    const own = aggregateFeasibleSlots({ ...base, ownerResourceIds: [OWNER], neighborsByResource: neighbors });
    const allKeys = new Set(keys(all));
    for (const k of keys(own)) expect(allKeys.has(k)).toBe(true);
    // O horario que a deslocacao nega ao dono nao reaparece por causa do filtro.
    expect(keys(own)).not.toContain(`${iso('10:00:00')}|${iso('11:00:00')}`);
  });

  it('pausa de almoco elimina o horario do dono', () => {
    const lunch = buildLunchBreakConfig({
      timezone: 'Europe/Lisbon',
      lunch_window_start: '12:00:00',
      lunch_window_end: '13:00:00',
      lunch_duration_minutes: 60,
    });
    // Visita do dono termina 12:30 locais (11:30Z), dentro da janela de almoco:
    // a proxima so pode comecar 60 min depois (13:30 locais = 12:30Z).
    const neighbors = new Map<string, NeighborVisitLike[]>([
      [OWNER, [{ start_datetime: iso('09:30:00'), end_datetime: iso('11:30:00'), location_lat: null, location_lng: null }]],
    ]);
    const rs: CandidateResource[] = [
      { resource_id: OWNER, available_slots: [slot('11:30:00', '12:30:00'), slot('12:30:00', '13:30:00')] },
    ];
    const own = aggregateFeasibleSlots({
      ...base, resources: rs, ownerResourceIds: [OWNER], neighborsByResource: neighbors,
      clientLat: null, clientLng: null, lunchBreak: lunch,
    });
    expect(keys(own)).toEqual([`${iso('12:30:00')}|${iso('13:30:00')}`]);
  });
});

describe('aggregateDayWithoutPostal - calendario sem codigo postal aplica o almoco como a marcacao', () => {
  const lunch = buildLunchBreakConfig({
    timezone: 'Europe/Lisbon',
    lunch_window_start: '12:00:00',
    lunch_window_end: '13:00:00',
    lunch_duration_minutes: 60,
  });
  // Visita 12:00-14:00 locais (11:00Z-13:00Z), sem coordenadas do cliente.
  const visit: NeighborVisitLike = {
    start_datetime: iso('11:00:00'), end_datetime: iso('13:00:00'), location_lat: null, location_lng: null,
  };
  const daySlots = [
    slot('09:00:00', '10:00:00'), // 10:00 locais, acaba as 11:00 locais
    slot('13:00:00', '14:00:00'), // 14:00 locais, cola na visita
    slot('13:30:00', '14:30:00'), // 14:30 locais, 30 min de folga
    slot('14:00:00', '15:00:00'), // 15:00 locais, 60 min de folga
  ];

  it('tira as horas que o book-slot recusaria e mantem as que aceita', async () => {
    const out = await aggregateDayWithoutPostal({
      resourceIds: [OWNER],
      getSlots: async () => daySlots,
      getNeighbors: async () => [visit],
      lunchBreak: lunch,
    });
    expect(keys(out)).toEqual([
      `${iso('09:00:00')}|${iso('10:00:00')}`,
      `${iso('14:00:00')}|${iso('15:00:00')}`,
    ]);
  });

  it('sem regra de almoco devolve tudo (comportamento antigo intacto) e conta recursos', async () => {
    const out = await aggregateDayWithoutPostal({
      resourceIds: [OWNER, OTHER],
      getSlots: async () => daySlots,
      getNeighbors: async () => [],
      lunchBreak: null,
    });
    expect(out).toHaveLength(4);
    expect(out.every((s) => s.available_count === 2)).toBe(true);
  });
});

describe('intersectMonthDays', () => {
  it('so fica marcado o dia que estava marcado E em que o dono tem horarios', () => {
    const today = ['2026-09-29', '2026-09-30', '2026-10-01'];
    const ownerDays = new Set(['2026-09-30', '2026-10-01', '2026-10-05']); // 10-05 nao estava marcado hoje
    const out = intersectMonthDays(today, ownerDays);
    expect(out).toEqual(['2026-09-30', '2026-10-01']);
    for (const d of out) expect(today).toContain(d);
  });

  it('dono sem nenhum dia: vazio', () => {
    expect(intersectMonthDays(['2026-09-29'], new Set())).toEqual([]);
  });
});

// --- Forma da resposta identica com e sem restricao (privacidade) ---------
// Quem experimenta um email so pode ver MENOS horarios; nunca chaves, contagens
// ou metadados que denunciem que o email e conhecido.
describe('forma da resposta identica com e sem restricao', () => {
  const CFG = { timezone: 'Europe/Lisbon', working_days: [1, 2, 3, 4, 5] };
  const sortedKeys = (o: object) => Object.keys(o).sort();
  // dono com menos horarios, e outro recurso com mais: available_count agregado
  // (2 nos horarios partilhados) NAO pode vazar na resposta nao restrita.
  const rs: CandidateResource[] = [
    { resource_id: OTHER, available_slots: DAY_SLOTS },
    { resource_id: OWNER, available_slots: DAY_SLOTS.slice(0, 2) },
  ];
  const all = aggregateFeasibleSlots({ ...base, resources: rs, ownerResourceIds: null });
  const own = aggregateFeasibleSlots({ ...base, resources: rs, ownerResourceIds: [OWNER] });

  it('modo dia COM codigo postal: mesmas chaves, mesmo available_count, sem preferred_resource_id', () => {
    // coverage vem da lista ANTES do filtro do dono: igual nos dois pedidos.
    const open = buildDayResponse({ slots: all, coverage: true, timezone: 'Europe/Lisbon', durationMinutes: 60, scheduleConfig: CFG });
    const restr = buildDayResponse({ slots: own, coverage: true, timezone: 'Europe/Lisbon', durationMinutes: 60, scheduleConfig: CFG });
    expect(sortedKeys(restr)).toEqual(sortedKeys(open));
    expect(restr.coverage).toBe(open.coverage);
    expect(all.some((s) => s.available_count > 1)).toBe(true); // havia contagem real a esconder
    for (const s of [...open.slots, ...restr.slots]) {
      expect(sortedKeys(s)).toEqual(['available_count', 'end', 'start']);
      expect(s.available_count).toBe(PUBLIC_AVAILABLE_COUNT);
      expect(s).not.toHaveProperty('preferred_resource_id');
    }
    // A unica diferenca e o conjunto de horarios, e o restrito e subconjunto.
    const openKeys = new Set(keys(open.slots));
    expect(restr.slots.length).toBeLessThan(open.slots.length);
    for (const k of keys(restr.slots)) expect(openKeys.has(k)).toBe(true);
  });

  it('coverage nao depende de o pedido ter sido restrito (dono sem horarios, lista completa com horarios)', () => {
    const ownerEmpty = aggregateFeasibleSlots({ ...base, resources: rs, ownerResourceIds: ['res-fantasma'] });
    expect(ownerEmpty).toEqual([]);
    const open = buildDayResponse({ slots: all, coverage: true, durationMinutes: 60 });
    const restr = buildDayResponse({ slots: ownerEmpty, coverage: true, durationMinutes: 60 });
    expect(restr.coverage).toBe(open.coverage);
    expect(restr.slots).toEqual([]);
    expect(sortedKeys(restr)).toEqual(sortedKeys(open));
  });

  it('modo dia SEM codigo postal: mesmas chaves e available_count constante', () => {
    // O modo sem CP devolve slots {start,end,available_count} sem resource_ids.
    const open = buildDayResponse({ slots: [{ start: iso('08:00:00'), end: iso('09:00:00'), available_count: 3 } as any], coverage: true, durationMinutes: 60 });
    const restr = buildDayResponse({ slots: [{ start: iso('08:00:00'), end: iso('09:00:00'), available_count: 1 } as any], coverage: true, durationMinutes: 60 });
    expect(restr).toEqual(open);
    expect(open.slots[0].available_count).toBe(PUBLIC_AVAILABLE_COUNT);
    expect(open.slots[0]).not.toHaveProperty('preferred_resource_id');
  });

  it('include_settings: schedule_config so aparece quando pedido, igual nos dois modos', () => {
    const a = buildDayResponse({ slots: all, coverage: true, durationMinutes: 60 });
    const b = buildDayResponse({ slots: own, coverage: true, durationMinutes: 60 });
    expect(sortedKeys(a)).toEqual(sortedKeys(b));
    expect(a).not.toHaveProperty('schedule_config');
    expect(a.timezone).toBe('Europe/Lisbon');
  });

  it('modo mes: mesmas chaves, com e sem restricao; so muda a lista de dias', () => {
    const today = ['2026-09-29', '2026-09-30', '2026-10-01'];
    const ownerDays = new Set(['2026-09-30']);
    const open = buildMonthResponse({ availableDates: today, scheduleConfig: CFG, durationMinutes: 60 });
    const restr = buildMonthResponse({ availableDates: intersectMonthDays(today, ownerDays), scheduleConfig: CFG, durationMinutes: 60 });
    expect(sortedKeys(restr)).toEqual(sortedKeys(open));
    expect(restr.timezone).toBe(open.timezone);
    expect(restr.duration_minutes).toBe(open.duration_minutes);
    expect(restr.schedule_config).toEqual(open.schedule_config);
    for (const d of restr.available_dates) expect(open.available_dates).toContain(d);
    expect(restr.available_dates.length).toBeLessThan(open.available_dates.length);
  });
});
