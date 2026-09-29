import { describe, expect, it } from 'vitest';
import { buildLunchBreakConfig } from '../travelFeasibility';
import {
  constrainAiSuggestion,
  isAssigneeSlotFeasible,
  type AssigneeFeasibilityContext,
  type AssigneeScheduleForFeasibility,
} from '../assigneeFeasibility';
import { zonedLocalToIso } from '../zonedTime';

// Dia 30/09/2026, Europe/Lisbon (UTC+1). Almoco 12:00-13:00, 60 min.
const TZ = 'Europe/Lisbon';
const DATE = '2026-09-30';
const LUNCH = buildLunchBreakConfig({
  timezone: TZ,
  lunch_window_start: '12:00:00',
  lunch_window_end: '13:00:00',
  lunch_duration_minutes: 60,
});
const RULES = { max_visits_per_day_per_employee: 6, max_visits_per_week_per_employee: 25 };
const at = (hhmm: string) => zonedLocalToIso(DATE, hhmm, TZ)!;
const visit = (from: string, to: string) => ({
  start: at(from),
  end: at(to),
  location_lat: null as number | null,
  location_lng: null as number | null,
});
const baseCtx = (over: Partial<AssigneeFeasibilityContext> = {}): AssigneeFeasibilityContext => ({
  date: DATE,
  timezone: TZ,
  durationMinutes: 60,
  bufferMinutes: 0,
  rules: RULES,
  clientLat: null,
  clientLng: null,
  lunchBreak: LUNCH,
  ...over,
});
const sched = (
  items: ReturnType<typeof visit>[],
  over: Partial<AssigneeScheduleForFeasibility> = {},
): AssigneeScheduleForFeasibility => ({
  scheduled_items: items,
  daily_visits_count: items.length,
  weekly_visits_count: items.length,
  ...over,
});
const range = (from: string, to: string) => ({ startIso: at(from), endIso: at(to) });

describe('isAssigneeSlotFeasible', () => {
  it('sem hora pedida so conta os limites', () => {
    expect(isAssigneeSlotFeasible(sched([]), null, baseCtx()).feasible).toBe(true);
    expect(isAssigneeSlotFeasible(sched([], { daily_visits_count: 6 }), null, baseCtx()).feasible).toBe(false);
  });
  it('limite semanal', () => {
    expect(isAssigneeSlotFeasible(sched([], { weekly_visits_count: 25 }), range('09:00', '10:00'), baseCtx()).feasible).toBe(false);
  });
  it('buffer: 10:00-11:00 com visita 09:00-10:00 e buffer 30 recusa; 10:30 aceita', () => {
    const s = sched([visit('09:00', '10:00')]);
    const ctx = baseCtx({ bufferMinutes: 30 });
    expect(isAssigneeSlotFeasible(s, range('10:00', '11:00'), ctx).feasible).toBe(false);
    expect(isAssigneeSlotFeasible(s, range('10:30', '11:30'), ctx).feasible).toBe(true);
  });
  it('a hora de Lisboa e avaliada como tal: visitas 11-12 e 12-13 obrigam a almoco depois', () => {
    const s = sched([visit('11:00', '12:00'), visit('12:00', '13:00')]);
    expect(isAssigneeSlotFeasible(s, range('13:00', '14:00'), baseCtx()).feasible).toBe(false);
    expect(isAssigneeSlotFeasible(s, range('14:00', '15:00'), baseCtx()).feasible).toBe(true);
  });
  it('visita existente 12:00-14:00: 11:00-12:00 aceite, 14:00 recusado, 15:00 aceite', () => {
    const s = sched([visit('12:00', '14:00')]);
    expect(isAssigneeSlotFeasible(s, range('11:00', '12:00'), baseCtx()).feasible).toBe(true);
    expect(isAssigneeSlotFeasible(s, range('14:00', '15:00'), baseCtx()).feasible).toBe(false);
    expect(isAssigneeSlotFeasible(s, range('15:00', '16:00'), baseCtx()).feasible).toBe(true);
  });
  it('almoco desligado (null): 14:00 aceite', () => {
    const s = sched([visit('12:00', '14:00')]);
    expect(isAssigneeSlotFeasible(s, range('14:00', '15:00'), baseCtx({ lunchBreak: null })).feasible).toBe(true);
  });
});

describe('constrainAiSuggestion', () => {
  const ai = (over: Record<string, unknown> = {}) => ({
    user_id: 'u1',
    available: true,
    reason: 'perto',
    suggested_time: null as string | null,
    ...over,
  });

  it('candidato da IA sem almoco livre sai como indisponivel, com o motivo acrescentado', () => {
    const s = sched([visit('12:00', '14:00')]);
    const out = constrainAiSuggestion(ai(), s, range('14:00', '15:00'), baseCtx());
    expect(out.available).toBe(false);
    expect(String(out.reason)).toContain('perto');
    expect(String(out.reason).length).toBeGreaterThan('perto'.length);
  });
  it('candidato viavel fica como a IA o deu', () => {
    const out = constrainAiSuggestion(ai(), sched([visit('12:00', '14:00')]), range('15:00', '16:00'), baseCtx());
    expect(out.available).toBe(true);
    expect(out.reason).toBe('perto');
  });
  it('nunca promove: se a IA disse false, continua false', () => {
    const out = constrainAiSuggestion(ai({ available: false }), sched([]), range('09:00', '10:00'), baseCtx());
    expect(out.available).toBe(false);
  });
  it('agenda em falta = indisponivel', () => {
    const out = constrainAiSuggestion(ai(), undefined, range('09:00', '10:00'), baseCtx());
    expect(out.available).toBe(false);
  });
  it('suggested_time inviavel (almoco) e descartado; viavel e mantido', () => {
    const s = sched([visit('12:00', '14:00')]);
    expect(constrainAiSuggestion(ai({ suggested_time: '14:00' }), s, range('09:00', '10:00'), baseCtx()).suggested_time).toBeNull();
    expect(constrainAiSuggestion(ai({ suggested_time: '15:00' }), s, range('09:00', '10:00'), baseCtx()).suggested_time).toBe('15:00');
  });
  it('suggested_time com formato invalido e descartado', () => {
    const s = sched([]);
    expect(constrainAiSuggestion(ai({ suggested_time: '25:99' }), s, range('09:00', '10:00'), baseCtx()).suggested_time).toBeNull();
    expect(constrainAiSuggestion(ai({ suggested_time: 'amanha' }), s, range('09:00', '10:00'), baseCtx()).suggested_time).toBeNull();
  });
  it('sem hora pedida so aplica os limites diario e semanal', () => {
    expect(constrainAiSuggestion(ai(), sched([], { daily_visits_count: 6 }), null, baseCtx()).available).toBe(false);
    expect(constrainAiSuggestion(ai(), sched([]), null, baseCtx()).available).toBe(true);
  });
});
