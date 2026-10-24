import { describe, it, expect } from 'vitest';
import { completeLunchFields } from '../lunchWindow';

describe('completeLunchFields', () => {
  it('preenche a duração quando início e fim estão preenchidos', () => {
    expect(completeLunchFields({ lunch_window_start: '12:00', lunch_window_end: '13:00' }))
      .toEqual({ lunch_duration_minutes: 60 });
  });

  it('preenche o fim quando há início e duração', () => {
    expect(completeLunchFields({ lunch_window_start: '12:00', lunch_duration_minutes: 45 }))
      .toEqual({ lunch_window_end: '12:45' });
  });

  it('preenche o início quando há fim e duração', () => {
    expect(completeLunchFields({ lunch_window_end: '13:30', lunch_duration_minutes: 60 }))
      .toEqual({ lunch_window_start: '12:30' });
  });

  it('nunca reescreve um campo já preenchido', () => {
    expect(completeLunchFields({
      lunch_window_start: '12:00',
      lunch_window_end: '13:00',
      lunch_duration_minutes: 30,
    })).toEqual({});
  });

  it('não inventa nada com um só campo', () => {
    expect(completeLunchFields({ lunch_window_start: '12:00' })).toEqual({});
    expect(completeLunchFields({ lunch_duration_minutes: 60 })).toEqual({});
  });

  it('ignora janelas invertidas, nulas ou demasiado longas', () => {
    expect(completeLunchFields({ lunch_window_start: '13:00', lunch_window_end: '12:00' })).toEqual({});
    expect(completeLunchFields({ lunch_window_start: '12:00', lunch_window_end: '12:00' })).toEqual({});
    expect(completeLunchFields({ lunch_window_start: '08:00', lunch_window_end: '20:00' })).toEqual({});
  });

  it('não passa da meia-noite nem abaixo da meia-noite', () => {
    expect(completeLunchFields({ lunch_window_start: '23:30', lunch_duration_minutes: 60 })).toEqual({});
    expect(completeLunchFields({ lunch_window_end: '00:30', lunch_duration_minutes: 60 })).toEqual({});
  });

  it('aceita horas com segundos', () => {
    expect(completeLunchFields({ lunch_window_start: '12:00:00', lunch_window_end: '13:15:00' }))
      .toEqual({ lunch_duration_minutes: 75 });
  });
});
