import { describe, expect, it } from 'vitest';
import { zonedDayBounds, zonedLocalToIso } from '../zonedTime';

describe('zonedLocalToIso', () => {
  it('13:00 de Lisboa no verao converte para 12:00Z', () => {
    expect(zonedLocalToIso('2026-09-30', '13:00', 'Europe/Lisbon')).toBe('2026-09-30T12:00:00.000Z');
  });
  it('12:00 de Lisboa no inverno converte para 12:00Z', () => {
    expect(zonedLocalToIso('2026-12-15', '12:00', 'Europe/Lisbon')).toBe('2026-12-15T12:00:00.000Z');
  });
  it('00:30 local de verao cai na vespera em UTC', () => {
    expect(zonedLocalToIso('2026-09-30', '00:30', 'Europe/Lisbon')).toBe('2026-09-29T23:30:00.000Z');
  });
  it('respeita o fuso pedido (Atlantic/Azores: UTC-1 no inverno, UTC+0 no verao)', () => {
    expect(zonedLocalToIso('2026-01-10', '10:00', 'Atlantic/Azores')).toBe('2026-01-10T11:00:00.000Z');
    expect(zonedLocalToIso('2026-07-10', '10:00', 'Atlantic/Azores')).toBe('2026-07-10T10:00:00.000Z');
  });
  it('dia da mudanca de hora (2026-03-29): 12:00 local e 11:00Z', () => {
    expect(zonedLocalToIso('2026-03-29', '12:00', 'Europe/Lisbon')).toBe('2026-03-29T11:00:00.000Z');
  });
  it('devolve null com data ou hora invalidas', () => {
    expect(zonedLocalToIso('2026-09-30', '25:00', 'Europe/Lisbon')).toBeNull();
    expect(zonedLocalToIso('30/09/2026', '10:00', 'Europe/Lisbon')).toBeNull();
    expect(zonedLocalToIso('2026-09-30', 'abc', 'Europe/Lisbon')).toBeNull();
  });
});

describe('zonedDayBounds', () => {
  it('dia de verao em Lisboa vai de 23:00Z da vespera a 22:59:59Z', () => {
    const b = zonedDayBounds('2026-09-30', 'Europe/Lisbon');
    expect(b.startIso).toBe('2026-09-29T23:00:00.000Z');
    expect(b.endIso).toBe('2026-09-30T22:59:59.000Z');
  });
  it('dia de inverno coincide com UTC', () => {
    const b = zonedDayBounds('2026-12-15', 'Europe/Lisbon');
    expect(b.startIso).toBe('2026-12-15T00:00:00.000Z');
    expect(b.endIso).toBe('2026-12-15T23:59:59.000Z');
  });
});
