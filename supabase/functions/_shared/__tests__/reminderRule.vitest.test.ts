import { describe, expect, it } from 'vitest';
import {
  anyReminderEnabled,
  positiveHours,
  reminderRuleFor,
  technicianReminderEnabled,
  technicianReminderHours,
} from '../reminderRule';

describe('reminderRuleFor', () => {
  it('cliente: o interruptor e as horas dele', () => {
    expect(reminderRuleFor({ reminder_enabled: true, reminder_hours_before: 5 }, 'client')).toEqual({ enabled: true, hoursBefore: 5 });
    expect(reminderRuleFor({ reminder_enabled: false, reminder_hours_before: 5 }, 'client').enabled).toBe(false);
  });

  it('cliente ignora os valores do comercial', () => {
    const src = { reminder_enabled: false, reminder_hours_before: 3, reminder_technician_enabled: true, reminder_technician_hours_before: 9 };
    expect(reminderRuleFor(src, 'client')).toEqual({ enabled: false, hoursBefore: 3 });
  });

  it('comercial vazio segue o cliente (interruptor e horas)', () => {
    const src = { reminder_enabled: true, reminder_hours_before: 24, reminder_technician_enabled: null, reminder_technician_hours_before: null };
    expect(reminderRuleFor(src, 'technician')).toEqual({ enabled: true, hoursBefore: 24 });
    expect(reminderRuleFor({ ...src, reminder_enabled: false }, 'technician').enabled).toBe(false);
  });

  it('valor explicito do comercial manda, incluindo desligar com o cliente ligado', () => {
    const src = { reminder_enabled: true, reminder_hours_before: 24, reminder_technician_enabled: false, reminder_technician_hours_before: 6 };
    expect(reminderRuleFor(src, 'technician')).toEqual({ enabled: false, hoursBefore: 6 });
    expect(reminderRuleFor({ ...src, reminder_enabled: false, reminder_technician_enabled: true }, 'technician'))
      .toEqual({ enabled: true, hoursBefore: 6 });
  });

  it('horas invalidas (zero, negativo, vazio) caem em 2 quando nenhum lado tem horas validas', () => {
    for (const bad of [0, -3, null, undefined, NaN]) {
      expect(reminderRuleFor({ reminder_enabled: true, reminder_hours_before: bad as number | null }, 'client').hoursBefore).toBe(2);
      expect(reminderRuleFor({ reminder_enabled: true, reminder_hours_before: bad as number | null, reminder_technician_hours_before: bad as number | null }, 'technician').hoursBefore).toBe(2);
    }
  });

  it('horas invalidas do comercial seguem as do cliente', () => {
    const src = { reminder_enabled: true, reminder_hours_before: 8, reminder_technician_hours_before: 0 };
    expect(reminderRuleFor(src, 'technician').hoursBefore).toBe(8);
  });

  it('sem configuracao: desligado e 2 horas', () => {
    expect(reminderRuleFor(null, 'client')).toEqual({ enabled: false, hoursBefore: 2 });
    expect(reminderRuleFor(undefined, 'technician')).toEqual({ enabled: false, hoursBefore: 2 });
  });
});

describe('anyReminderEnabled', () => {
  it('liga se qualquer dos dois estiver ligado', () => {
    expect(anyReminderEnabled({ reminder_enabled: false })).toBe(false);
    expect(anyReminderEnabled({ reminder_enabled: true })).toBe(true);
    expect(anyReminderEnabled({ reminder_enabled: false, reminder_technician_enabled: true })).toBe(true);
    expect(anyReminderEnabled({ reminder_enabled: true, reminder_technician_enabled: false })).toBe(true);
    expect(anyReminderEnabled(null)).toBe(false);
  });
});

describe('auxiliares', () => {
  it('positiveHours', () => {
    expect(positiveHours(3)).toBe(3);
    expect(positiveHours(0)).toBeNull();
    expect(positiveHours(null)).toBeNull();
  });
  it('technicianReminderEnabled / Hours sem configuracao', () => {
    expect(technicianReminderEnabled(null)).toBe(false);
    expect(technicianReminderHours(null)).toBeNull();
    expect(technicianReminderHours({ reminder_hours_before: 0 })).toBeNull();
  });
});
