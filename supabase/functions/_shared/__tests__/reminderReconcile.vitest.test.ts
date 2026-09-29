import { describe, expect, it } from 'vitest';
import { decideReminderAction } from '../reminderReconcile';
import type { ReminderRow, ReminderVisit } from '../reminderReconcile';

const H = 3600_000;
const NOW = new Date('2026-10-01T09:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();

// Visita amanha as 10:00, lembrete 2h antes, marcado para amanha as 08:00.
const VISIT_START = new Date('2026-10-02T10:00:00Z').getTime();
const row = (over: Partial<ReminderRow> = {}): ReminderRow => ({
  scheduled_for: iso(VISIT_START - 2 * H),
  to_email: 'ana@x.pt',
  user_id: 'u-ana',
  kind: 'technician',
  visit_start_snapshot: iso(VISIT_START),
  ...over,
});
const visit = (over: Partial<ReminderVisit> = {}): ReminderVisit => ({
  status: 'scheduled',
  start_datetime: iso(VISIT_START),
  ...over,
});
const ANA = { email: 'ana@x.pt', user_id: 'u-ana' };

describe('decideReminderAction', () => {
  it('sem mudancas: send, sem tocar em nada', () => {
    const d = decideReminderAction(row(), visit(), ANA, NOW);
    expect(d.action).toBe('send');
    expect(d.scheduled_for).toBe(row().scheduled_for);
    expect(d.to_email).toBe('ana@x.pt');
  });

  it('visita apagada: cancel', () => {
    expect(decideReminderAction(row(), null, ANA, NOW).action).toBe('cancel');
  });

  it('visita cancelada: cancel', () => {
    expect(decideReminderAction(row(), visit({ status: 'cancelled' }), ANA, NOW).action).toBe('cancel');
  });

  it('visita ja passada: cancel', () => {
    const past = new Date('2026-10-01T08:00:00Z').getTime();
    expect(decideReminderAction(row(), visit({ start_datetime: iso(past) }), ANA, NOW).action).toBe('cancel');
  });

  it('hora adiada 1 dia: move, mantendo a antecedencia de 2h', () => {
    const later = VISIT_START + 24 * H;
    const d = decideReminderAction(row(), visit({ start_datetime: iso(later) }), ANA, NOW);
    expect(d.action).toBe('move');
    expect(d.scheduled_for).toBe(iso(later - 2 * H));
    expect(d.snapshot).toBe(iso(later));
  });

  it('hora adiantada mas o lembrete novo ainda esta no futuro: move', () => {
    const earlier = VISIT_START - 4 * H; // 06:00 de amanha; lembrete 04:00
    const d = decideReminderAction(row(), visit({ start_datetime: iso(earlier) }), ANA, NOW);
    expect(d.action).toBe('move');
    expect(d.scheduled_for).toBe(iso(earlier - 2 * H));
  });

  it('hora adiantada para dentro de 1h: lembrete novo ja vencido, visita nao: send imediato', () => {
    const soon = NOW.getTime() + 1 * H;
    const d = decideReminderAction(row(), visit({ start_datetime: iso(soon) }), ANA, NOW);
    expect(d.action).toBe('send');
    expect(d.scheduled_for).toBe(NOW.toISOString());
    expect(d.snapshot).toBe(iso(soon));
  });

  it('comercial trocado: retarget para o email e utilizador do actual', () => {
    const d = decideReminderAction(row(), visit(), { email: 'Rui@X.pt', user_id: 'u-rui' }, NOW);
    expect(d.action).toBe('retarget');
    expect(d.to_email).toBe('rui@x.pt');
    expect(d.user_id).toBe('u-rui');
    expect(d.scheduled_for).toBe(row().scheduled_for);
  });

  it('mesmo comercial com maiusculas diferentes: send', () => {
    const d = decideReminderAction(row(), visit(), { email: 'ANA@x.pt', user_id: 'u-ana' }, NOW);
    expect(d.action).toBe('send');
  });

  it('hora e comercial mudaram: move ja com o destino novo', () => {
    const later = VISIT_START + 24 * H;
    const d = decideReminderAction(row(), visit({ start_datetime: iso(later) }), { email: 'rui@x.pt', user_id: 'u-rui' }, NOW);
    expect(d.action).toBe('move');
    expect(d.to_email).toBe('rui@x.pt');
    expect(d.user_id).toBe('u-rui');
  });

  it('visita sem comercial e linha do comercial: cancel', () => {
    expect(decideReminderAction(row(), visit(), null, NOW).action).toBe('cancel');
  });

  it('comercial actual sem email e linha do comercial: cancel', () => {
    expect(decideReminderAction(row(), visit(), { email: null, user_id: 'u-x' }, NOW).action).toBe('cancel');
  });

  it('linha do cliente nao depende do comercial: sem comercial continua send', () => {
    const d = decideReminderAction(row({ kind: 'client', to_email: 'lead@x.pt', user_id: null }), visit(), null, NOW);
    expect(d.action).toBe('send');
    expect(d.to_email).toBe('lead@x.pt');
  });

  it('linha do cliente com hora mudada: move sem alterar o destino', () => {
    const later = VISIT_START + 2 * H;
    const d = decideReminderAction(
      row({ kind: 'client', to_email: 'lead@x.pt', user_id: null }),
      visit({ start_datetime: iso(later) }),
      { email: 'rui@x.pt', user_id: 'u-rui' },
      NOW,
    );
    expect(d.action).toBe('move');
    expect(d.to_email).toBe('lead@x.pt');
    expect(d.user_id).toBeNull();
  });
});
