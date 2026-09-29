import { describe, expect, it } from 'vitest';
import {
  needsNewReminderLines,
  planReminderActions,
  REASON_REMINDER_TIME_PASSED,
  REASON_TECHNICIAN_REMOVED,
  REASON_VISIT_GONE,
} from '../reminderReconcile';
import type { ReminderFormState, ReminderLine, ReminderVisit } from '../reminderReconcile';

const H = 3600_000;
const NOW = new Date('2026-10-01T09:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();

// Visita amanha as 10:00, lembrete 24h antes (hoje as 10:00 -> ja passou, por
// isso usamos 2h nos casos base: lembrete amanha as 08:00).
const START = new Date('2026-10-02T10:00:00Z').getTime();
const FORM_2H: ReminderFormState = { reminder_enabled: true, reminder_hours_before: 2 };

const line = (over: Partial<ReminderLine> = {}): ReminderLine => ({
  id: 'l1',
  channel: 'email',
  audience: 'technician',
  recipient: 'ana@x.pt',
  status: 'pending',
  scheduled_for: iso(START - 2 * H),
  visit_start_snapshot: iso(START),
  ...over,
});
const client = (over: Partial<ReminderLine> = {}) =>
  line({ id: 'c1', audience: 'client', recipient: 'cli@x.pt', ...over });
const visit = (over: Partial<ReminderVisit> = {}): ReminderVisit => ({
  status: 'scheduled',
  start_datetime: iso(START),
  ...over,
});
const ANA = { email: 'ana@x.pt', user_id: 'u-ana' };
const BRUNO = { email: 'bruno@x.pt', user_id: 'u-bruno' };

const plan = (o: Partial<Parameters<typeof planReminderActions>[0]> = {}) =>
  planReminderActions({
    lines: [line(), client()],
    visit: visit(),
    technicians: [ANA],
    form: FORM_2H,
    now: NOW,
    ...o,
  });

describe('planReminderActions', () => {
  it('sem mudancas: nada a fazer', () => {
    expect(plan()).toEqual([]);
  });

  describe('visita que ja nao conta', () => {
    it.each([
      ['apagada', null],
      ['cancelada', visit({ status: 'cancelled' })],
      ['ja passada', visit({ start_datetime: iso(NOW.getTime() - H) })],
    ])('%s: cancela todos os pendentes (email e SMS)', (_n, v) => {
      const sms = client({ id: 's1', channel: 'sms', recipient: '+351900' });
      const sent = client({ id: 'done', status: 'sent' });
      const actions = plan({ visit: v, lines: [line(), client(), sms, sent] });
      expect(actions.map((a) => (a.kind === 'cancel' ? a.line_id : null)).sort()).toEqual(['c1', 'l1', 's1']);
      expect(actions.every((a) => a.kind === 'cancel' && a.reason === REASON_VISIT_GONE)).toBe(true);
    });
  });

  describe('a visita mudou de hora', () => {
    it('lembrete passa a sair X horas antes da NOVA data, X = intervalo actual do formulario', () => {
      // visita amanha 10h com lembrete 24h antes, movida para dia 1 depois de amanha 10h
      const form = { reminder_enabled: true, reminder_hours_before: 24 };
      const later = START + 24 * H;
      const lines = [
        line({ scheduled_for: iso(START - 24 * H) }),
        client({ scheduled_for: iso(START - 24 * H) }),
      ];
      const actions = plan({ lines, form, visit: visit({ start_datetime: iso(later) }) });
      expect(actions).toEqual([
        { kind: 'move', line_id: 'l1', channel: 'email', scheduled_for: iso(later - 24 * H), snapshot: iso(later) },
        { kind: 'move', line_id: 'c1', channel: 'email', scheduled_for: iso(later - 24 * H), snapshot: iso(later) },
      ]);
    });

    it('se o formulario mudou de intervalo desde a marcacao, vale o do formulario', () => {
      const later = START + 48 * H;
      const actions = plan({
        lines: [client()], // gravado com 2h
        technicians: [],
        form: { reminder_enabled: true, reminder_hours_before: 6 },
        visit: visit({ start_datetime: iso(later) }),
      });
      expect(actions).toEqual([
        { kind: 'move', line_id: 'c1', channel: 'email', scheduled_for: iso(later - 6 * H), snapshot: iso(later) },
      ]);
    });

    it('sem formulario usa o intervalo gravado (snapshot - scheduled_for)', () => {
      const later = START + 24 * H;
      const actions = plan({ lines: [client()], form: null, visit: visit({ start_datetime: iso(later) }) });
      expect(actions).toEqual([
        { kind: 'move', line_id: 'c1', channel: 'email', scheduled_for: iso(later - 2 * H), snapshot: iso(later) },
      ]);
    });

    it('formulario com intervalo invalido (0) tambem cai no gravado', () => {
      const later = START + 24 * H;
      const actions = plan({
        lines: [client()],
        form: { reminder_enabled: true, reminder_hours_before: 0 },
        visit: visit({ start_datetime: iso(later) }),
      });
      expect(actions[0]).toMatchObject({ kind: 'move', scheduled_for: iso(later - 2 * H) });
    });

    it('hora adiantada: a hora nova do lembrete ja passou -> cancela com motivo, nunca envia logo', () => {
      // visita passa para hoje as 10:00 (daqui a 1h); lembrete 2h antes = 08:00, ja passou
      const soon = NOW.getTime() + 1 * H;
      const actions = plan({ lines: [client()], visit: visit({ start_datetime: iso(soon) }) });
      expect(actions).toEqual([
        { kind: 'cancel', line_id: 'c1', channel: 'email', reason: REASON_REMINDER_TIME_PASSED },
      ]);
    });

    it('SMS do cliente tambem acompanha a hora', () => {
      const later = START + 24 * H;
      const sms = client({ id: 's1', channel: 'sms', recipient: '+351900' });
      const actions = plan({ lines: [sms], technicians: [], visit: visit({ start_datetime: iso(later) }) });
      expect(actions).toEqual([
        { kind: 'move', line_id: 's1', channel: 'sms', scheduled_for: iso(later - 2 * H), snapshot: iso(later) },
      ]);
    });

    it('linhas ja enviadas nao se movem', () => {
      const actions = plan({
        lines: [client({ status: 'sent' })],
        technicians: [],
        visit: visit({ start_datetime: iso(START + 24 * H) }),
      });
      expect(actions).toEqual([]);
    });

    it('linha sem snapshot nao se move (nada a comparar)', () => {
      const actions = plan({
        lines: [client({ visit_start_snapshot: null })],
        technicians: [],
        visit: visit({ start_datetime: iso(START + 24 * H) }),
      });
      expect(actions).toEqual([]);
    });
  });

  describe('varios comerciais na visita', () => {
    it('cancela o lembrete do comercial retirado e cria o do acrescentado', () => {
      const actions = plan({ technicians: [BRUNO], lines: [line(), client()] });
      expect(actions).toEqual([
        { kind: 'cancel', line_id: 'l1', channel: 'email', reason: REASON_TECHNICIAN_REMOVED },
        {
          kind: 'create_technician',
          email: 'bruno@x.pt',
          user_id: 'u-bruno',
          scheduled_for: iso(START - 2 * H),
          snapshot: iso(START),
        },
      ]);
    });

    it('o lembrete vai a TODOS: cria so os que faltam, mantem os que existem', () => {
      const actions = plan({ technicians: [ANA, BRUNO] });
      expect(actions).toEqual([
        {
          kind: 'create_technician',
          email: 'bruno@x.pt',
          user_id: 'u-bruno',
          scheduled_for: iso(START - 2 * H),
          snapshot: iso(START),
        },
      ]);
    });

    it('comparacao de emails ignora maiusculas e espacos', () => {
      const actions = plan({ technicians: [{ email: '  ANA@x.pt ', user_id: 'u-ana' }] });
      expect(actions).toEqual([]);
    });

    it('comercial que ja recebeu (sent) ou falhou nao recebe outro', () => {
      const sent = line({ id: 'l2', recipient: 'bruno@x.pt', status: 'sent' });
      const failed = line({ id: 'l3', recipient: 'carla@x.pt', status: 'failed' });
      const actions = plan({
        lines: [client(), sent, failed],
        technicians: [BRUNO, { email: 'carla@x.pt', user_id: 'u-c' }],
      });
      expect(actions).toEqual([]);
    });

    it('comercial cujo lembrete foi cancelado e depois voltou a visita: cria de novo', () => {
      const cancelled = line({ id: 'l2', recipient: 'bruno@x.pt', status: 'cancelled' });
      const actions = plan({ lines: [client(), cancelled], technicians: [BRUNO] });
      expect(actions.filter((a) => a.kind === 'create_technician')).toHaveLength(1);
    });

    it('comercial sem email nao recebe lembrete', () => {
      const actions = plan({ technicians: [ANA, { email: null, user_id: 'u-x' }, { email: ' ', user_id: 'u-y' }] });
      expect(actions).toEqual([]);
    });

    it('nao cria quando a hora do lembrete ja passou', () => {
      const soon = NOW.getTime() + 1 * H;
      const actions = plan({
        lines: [client({ visit_start_snapshot: iso(soon), scheduled_for: iso(soon - 2 * H) })],
        technicians: [BRUNO],
        visit: visit({ start_datetime: iso(soon) }),
      });
      expect(actions).toEqual([]);
    });

    it('nao cria quando o formulario tem o lembrete desligado, ou nao existe', () => {
      expect(plan({ technicians: [BRUNO], form: { reminder_enabled: false, reminder_hours_before: 2 } })
        .filter((a) => a.kind === 'create_technician')).toEqual([]);
      expect(plan({ technicians: [BRUNO], form: null }).filter((a) => a.kind === 'create_technician')).toEqual([]);
    });

    it('nao cria se a visita nunca teve lembretes', () => {
      const actions = plan({ lines: [], technicians: [BRUNO] });
      expect(actions).toEqual([]);
    });

    it('visita movida: move os existentes e cria o do acrescentado na hora nova', () => {
      const later = START + 24 * H;
      const actions = plan({ technicians: [ANA, BRUNO], visit: visit({ start_datetime: iso(later) }) });
      expect(actions).toEqual(expect.arrayContaining([
        { kind: 'move', line_id: 'l1', channel: 'email', scheduled_for: iso(later - 2 * H), snapshot: iso(later) },
        { kind: 'move', line_id: 'c1', channel: 'email', scheduled_for: iso(later - 2 * H), snapshot: iso(later) },
        { kind: 'create_technician', email: 'bruno@x.pt', user_id: 'u-bruno', scheduled_for: iso(later - 2 * H), snapshot: iso(later) },
      ]));
      expect(actions).toHaveLength(3);
    });

    it('visita ficou sem comercial: cancela o do comercial, mantem o do cliente', () => {
      const actions = plan({ technicians: [] });
      expect(actions).toEqual([
        { kind: 'cancel', line_id: 'l1', channel: 'email', reason: REASON_TECHNICIAN_REMOVED },
      ]);
    });
  });
});

describe("needsNewReminderLines (reagendar pelo link)", () => {
  it("sem linhas: cria", () => expect(needsNewReminderLines([])).toBe(true));
  it("so uma enviada (da data anterior): cria para a nova data", () => expect(needsNewReminderLines([{ status: "sent" }])).toBe(true));
  it("so falhadas ou canceladas por a hora ja ter passado: cria", () => expect(needsNewReminderLines([{ status: "failed" }, { status: "cancelled" }])).toBe(true));
  it("ha uma pendente (ja acertada para a nova data): nao duplica", () => expect(needsNewReminderLines([{ status: "sent" }, { status: "pending" }])).toBe(false));
});
