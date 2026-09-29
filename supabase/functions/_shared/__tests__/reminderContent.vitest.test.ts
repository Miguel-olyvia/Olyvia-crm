import { describe, expect, it } from 'vitest';
import {
  buildReminderMail,
  formatVisitWhen,
  parseContentVars,
  reminderSmsTemplate,
  withFreshVisitVars,
} from '../reminderContent';

const VARS = {
  lead_name: 'Rita Sousa',
  meeting_date: 'segunda-feira, 5 de outubro de 2026, 10:00',
  location: 'Rua A, Lisboa',
  technician_name: 'Ana',
  cancel_url: 'https://app.test/booking/manage?token=abc',
  confirm_url: 'https://app.test/booking/confirm?token=xyz',
};

describe('buildReminderMail', () => {
  it('cliente: texto padrao com links de gerir e confirmar', () => {
    const m = buildReminderMail({ audience: 'client', template: null, vars: VARS, brand: null });
    expect(m.subject).toBe('Lembrete: reunião segunda-feira, 5 de outubro de 2026, 10:00');
    expect(m.html).toContain('Este é um lembrete da sua visita agendada.');
    expect(m.html).toContain('booking/manage?token=abc');
    expect(m.html).toContain('booking/confirm?token=xyz');
  });

  it('comercial: texto padrao sem os links do cliente', () => {
    const m = buildReminderMail({
      audience: 'technician',
      template: null,
      vars: { ...VARS, cancel_url: '', confirm_url: '' },
      brand: null,
    });
    expect(m.html).toContain('tem uma visita agendada');
    expect(m.html).not.toContain('booking/manage');
    expect(m.html).not.toContain('booking/confirm');
  });

  it('modelo proprio: renderiza assunto e corpo com as variaveis (escapadas)', () => {
    const m = buildReminderMail({
      audience: 'client',
      template: { subject: 'Visita {{meeting_date}}', body_html: '<p>Ola {{lead_name}} - {{technician_name}}</p>' },
      vars: { ...VARS, lead_name: '<b>Rita</b>' },
      brand: null,
    });
    expect(m.subject).toBe('Visita segunda-feira, 5 de outubro de 2026, 10:00');
    expect(m.html).toBe('<p>Ola &lt;b&gt;Rita&lt;/b&gt; - Ana</p>');
  });

  it('modelo sem assunto usa o assunto padrao', () => {
    const m = buildReminderMail({
      audience: 'client',
      template: { subject: '', body_html: '<p>x</p>' },
      vars: VARS,
      brand: null,
    });
    expect(m.subject).toContain('Lembrete: reunião');
  });
});

describe('withFreshVisitVars', () => {
  it('troca a hora e o comercial pelos actuais, sem mutar o original', () => {
    const stored = { ...VARS };
    const fresh = withFreshVisitVars(stored, {
      startIso: '2026-11-03T10:00:00Z',
      location: 'Nova morada',
      technicianName: 'Bruno',
    });
    expect(fresh.meeting_date).toBe(formatVisitWhen('2026-11-03T10:00:00Z'));
    expect(fresh.meeting_datetime).toBe(fresh.meeting_date);
    expect(fresh.meeting_date).toContain('novembro');
    expect(fresh.location).toBe('Nova morada');
    expect(fresh.technician_name).toBe('Bruno');
    expect(fresh.lead_name).toBe('Rita Sousa');
    expect(stored.technician_name).toBe('Ana');
  });

  it('sem local/comercial actuais mantem o guardado', () => {
    const fresh = withFreshVisitVars(VARS, { startIso: '2026-11-03T10:00:00Z' });
    expect(fresh.location).toBe('Rua A, Lisboa');
    expect(fresh.technician_name).toBe('Ana');
  });
});

describe('formatVisitWhen', () => {
  it('usa o fuso de Lisboa', () => {
    // 09:00Z em Outubro (WEST, UTC+1) -> 10:00 em Lisboa
    expect(formatVisitWhen('2026-10-05T09:00:00Z')).toContain('10:00');
  });
});

describe('parseContentVars', () => {
  it('objecto -> mapa de strings; o resto -> null', () => {
    expect(parseContentVars({ a: 1, b: null, c: 'x' })).toEqual({ a: '1', b: '', c: 'x' });
    expect(parseContentVars(null)).toBeNull();
    expect(parseContentVars(['a'])).toBeNull();
    expect(parseContentVars('x')).toBeNull();
  });
});

describe('reminderSmsTemplate', () => {
  it('sem links so tem a data', () => {
    expect(reminderSmsTemplate({ companyName: 'Mudelar', rescheduled: false, withConfirmLink: false, withManageLink: false }))
      .toBe('Mudelar: lembrete da sua visita para {{meeting_date}}.');
  });
  it('reagendada com link de gerir', () => {
    expect(reminderSmsTemplate({ companyName: '', rescheduled: true, withConfirmLink: false, withManageLink: true }))
      .toBe('A empresa: lembrete da sua visita reagendada para {{meeting_date}}. Gerir: {{cancel_url}}');
  });
  it('marcacao com link de confirmar', () => {
    expect(reminderSmsTemplate({ companyName: 'X', rescheduled: false, withConfirmLink: true, withManageLink: false }))
      .toContain('Confirme: {{confirm_url}}');
  });
});
