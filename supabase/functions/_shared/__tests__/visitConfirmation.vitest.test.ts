import { describe, expect, it, vi } from 'vitest';
import {
  buildConfirmationEmailContent,
  buildConfirmationSmsText,
  callerCanEditSchedule,
  decideAfterAttempt,
  loadFormConfirmationSendOn,
  loadVisitConfirmationState,
  MAX_SEND_ATTEMPTS,
  normalizeSendOn,
  shouldCancelReminderForVisit,
  shouldSuppressClientChangeNotice,
} from '../visitConfirmation';
import type { FormEmailConfig } from '../formEmails';

const NOW = new Date('2026-11-23T10:00:00Z');

function cfg(over: Partial<FormEmailConfig> = {}): FormEmailConfig {
  return {
    confirmation_email_enabled: true,
    confirmation_email_template_id: null,
    confirmation_sms_enabled: true,
    confirmation_sms_message: null,
    confirmation_sms_include_link: false,
    email_locale_templates: null,
    primary_color: null,
    logo_url: null,
    ...over,
  } as FormEmailConfig;
}

/** Cliente mínimo: cada tabela devolve o que se lhe der, ou um erro. */
function tableDb(tables: Record<string, { data?: unknown; error?: { message: string } | null }>) {
  const chain = (table: string) => {
    const res = tables[table] ?? { data: null, error: null };
    const b: Record<string, unknown> = {};
    const self = () => b;
    b.select = self; b.eq = self; b.in = self; b.limit = self; b.order = self;
    b.maybeSingle = () => Promise.resolve({ data: res.data ?? null, error: res.error ?? null });
    b.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: res.data ?? null, error: res.error ?? null }).then(ok);
    return b;
  };
  return { from: (t: string) => chain(t) };
}

describe('normalizeSendOn', () => {
  it('so agenda_confirm liga o modo novo; tudo o resto e o de hoje', () => {
    expect(normalizeSendOn('agenda_confirm')).toBe('agenda_confirm');
    expect(normalizeSendOn('booking')).toBe('booking');
    expect(normalizeSendOn(null)).toBe('booking');
    expect(normalizeSendOn(undefined)).toBe('booking');
    expect(normalizeSendOn('AGENDA_CONFIRM')).toBe('booking');
  });
});

describe('loadFormConfirmationSendOn', () => {
  it('le o modo do formulario', async () => {
    const db = tableDb({ form_branding: { data: { confirmation_send_on: 'agenda_confirm' } } });
    expect(await loadFormConfirmationSendOn(db, 'f1')).toBe('agenda_confirm');
  });
  it('erro de leitura (coluna ainda por criar) cai no comportamento de hoje', async () => {
    const db = tableDb({ form_branding: { error: { message: 'column does not exist' } } });
    expect(await loadFormConfirmationSendOn(db, 'f1')).toBe('booking');
  });
  it('sem formulario e o de hoje', async () => {
    expect(await loadFormConfirmationSendOn(tableDb({}), null)).toBe('booking');
  });
});

describe('loadVisitConfirmationState', () => {
  it('modo novo com confirmacao ja enviada', async () => {
    const db = tableDb({
      schedule_items: { data: { confirmation_send_on: 'agenda_confirm' } },
      visit_confirmation_sends: { data: [{ id: 'x' }] },
    });
    expect(await loadVisitConfirmationState(db, 'i1')).toEqual({ mode: 'agenda_confirm', everSent: true });
  });
  it('modo novo sem envio', async () => {
    const db = tableDb({
      schedule_items: { data: { confirmation_send_on: 'agenda_confirm' } },
      visit_confirmation_sends: { data: [] },
    });
    expect(await loadVisitConfirmationState(db, 'i1')).toEqual({ mode: 'agenda_confirm', everSent: false });
  });
  it('qualquer erro devolve o modo de hoje (nao cala avisos que hoje saem)', async () => {
    const db = tableDb({ schedule_items: { error: { message: 'boom' } } });
    expect(await loadVisitConfirmationState(db, 'i1')).toEqual({ mode: 'booking', everSent: false });
  });
});

describe('shouldSuppressClientChangeNotice (regra 4)', () => {
  it('remarcar antes de confirmar nao avisa o cliente', () => {
    expect(shouldSuppressClientChangeNotice({ mode: 'agenda_confirm', everSent: false })).toBe(true);
  });
  it('depois de a confirmacao ter saido, avisa como hoje', () => {
    expect(shouldSuppressClientChangeNotice({ mode: 'agenda_confirm', everSent: true })).toBe(false);
  });
  it('modo de hoje: nunca suprime', () => {
    expect(shouldSuppressClientChangeNotice({ mode: 'booking', everSent: false })).toBe(false);
  });
});

describe('shouldCancelReminderForVisit', () => {
  it('modo novo: lembrete de visita por confirmar cancela-se', () => {
    expect(shouldCancelReminderForVisit('agenda_confirm', 'scheduled')).toBe(true);
    expect(shouldCancelReminderForVisit('agenda_confirm', 'rescheduled')).toBe(true);
    expect(shouldCancelReminderForVisit('agenda_confirm', 'draft')).toBe(true);
  });
  it('modo novo: visita confirmada mantem o lembrete', () => {
    expect(shouldCancelReminderForVisit('agenda_confirm', 'confirmed')).toBe(false);
    expect(shouldCancelReminderForVisit('agenda_confirm', 'in_progress')).toBe(false);
  });
  it('modo de hoje: nunca', () => {
    expect(shouldCancelReminderForVisit(null, 'scheduled')).toBe(false);
    expect(shouldCancelReminderForVisit('booking', 'scheduled')).toBe(false);
  });
});

describe('decideAfterAttempt', () => {
  it('sucesso fica enviado', () => {
    expect(decideAfterAttempt({ attempts: 1, ok: true, now: NOW })).toEqual({ status: 'sent', error: null, nextAttemptAt: null });
  });
  it('falha antes do maximo volta a fila com espera crescente', () => {
    const first = decideAfterAttempt({ attempts: 1, ok: false, error: 'smtp', now: NOW });
    const second = decideAfterAttempt({ attempts: 2, ok: false, error: 'smtp', now: NOW });
    expect(first.status).toBe('pending');
    expect(second.status).toBe('pending');
    const wait1 = new Date(first.nextAttemptAt as string).getTime() - NOW.getTime();
    const wait2 = new Date(second.nextAttemptAt as string).getTime() - NOW.getTime();
    expect(wait1).toBe(5 * 60_000);
    expect(wait2).toBe(10 * 60_000);
    expect(first.error).toBe('smtp');
  });
  it('a ultima tentativa falhada fica falhada, com o motivo', () => {
    const last = decideAfterAttempt({ attempts: MAX_SEND_ATTEMPTS, ok: false, error: 'numero invalido', now: NOW });
    expect(last).toEqual({ status: 'failed', error: 'numero invalido', nextAttemptAt: null });
  });
  it('falha sem motivo leva um texto', () => {
    expect(decideAfterAttempt({ attempts: MAX_SEND_ATTEMPTS, ok: false, now: NOW }).error).toBeTruthy();
  });
});

describe('buildConfirmationSmsText (extraido do book-slot, igual ao de hoje)', () => {
  const vars = { lead_name: 'Rita', meeting_date: 'X', cancel_url: 'https://g/x' };
  it('sem mensagem configurada: texto por omissao, sem link quando a opcao esta desligada', () => {
    const text = buildConfirmationSmsText({
      emailCfg: cfg(),
      formSettings: null,
      leadLocale: 'pt',
      formDefaultLocale: 'pt',
      companyName: 'Acme',
      cancelLink: 'https://g/x',
      baseVars: vars,
      startIso: '2026-12-01T10:00:00Z',
    });
    expect(text.startsWith('Acme:')).toBe(true);
    expect(text).not.toContain('https://g/x');
  });
  it('mensagem propria com {{cancel_url}} e link permitido leva o link', () => {
    const text = buildConfirmationSmsText({
      emailCfg: cfg({ confirmation_sms_message: 'Ola {{lead_name}} {{cancel_url}}', confirmation_sms_include_link: true }),
      formSettings: null,
      leadLocale: 'pt',
      formDefaultLocale: 'pt',
      companyName: 'Acme',
      cancelLink: 'https://g/x',
      baseVars: vars,
      startIso: '2026-12-01T10:00:00Z',
    });
    expect(text).toBe('Ola Rita https://g/x');
  });
  it('mensagem propria sem link permitido: {{cancel_url}} fica vazio', () => {
    const text = buildConfirmationSmsText({
      emailCfg: cfg({ confirmation_sms_message: 'Ola {{lead_name}}{{cancel_url}}' }),
      formSettings: null,
      leadLocale: 'pt',
      formDefaultLocale: 'pt',
      companyName: 'Acme',
      cancelLink: 'https://g/x',
      baseVars: vars,
      startIso: '2026-12-01T10:00:00Z',
    });
    expect(text).toBe('Ola Rita');
  });
});

describe('buildConfirmationEmailContent', () => {
  it('sem modelo: texto por omissao com o local e o link de gerir', async () => {
    const mail = await buildConfirmationEmailContent({
      supabase: tableDb({}),
      emailCfg: cfg(),
      leadLocale: 'pt',
      formDefaultLocale: 'pt',
      startIso: '2026-12-01T10:00:00Z',
      baseVars: { lead_name: 'Rita' },
      leadFullName: 'Rita Sousa',
      fullLocation: 'Rua A',
      technicianName: 'Ana',
      cancelLink: 'https://g/manage?token=t',
    });
    expect(mail.subject.length).toBeGreaterThan(0);
    expect(mail.html).toContain('Rua A');
    expect(mail.html).toContain('https://g/manage?token=t');
  });
  it('com modelo: assunto e corpo vem do modelo, com as variaveis', async () => {
    const db = tableDb({ email_templates: { data: { subject: 'Visita {{lead_name}}', body_html: '<p>{{meeting_date}}</p>' } } });
    const mail = await buildConfirmationEmailContent({
      supabase: db,
      emailCfg: cfg({ confirmation_email_template_id: 'tpl-1' }),
      leadLocale: 'pt',
      formDefaultLocale: 'pt',
      startIso: '2026-12-01T10:00:00Z',
      baseVars: { lead_name: 'Rita' },
      leadFullName: 'Rita',
      fullLocation: '',
      technicianName: '',
      cancelLink: '',
    });
    expect(mail.subject).toBe('Visita Rita');
    expect(mail.html.startsWith('<p>')).toBe(true);
  });
});

describe('processador de lembretes: defesa do modo novo', () => {
  const row = { schedule_item_id: 'i1', content_vars: { lead_name: 'Rita' }, message: 'Ola', locale: 'pt' };
  it('lembrete de visita em modo novo ainda por confirmar cancela-se (email e SMS)', async () => {
    const { renderLinkedEmail, renderLinkedSms } = await import('../reminderRunner');
    const db = tableDb({
      schedule_items: { data: { status: 'scheduled', start_datetime: '2026-12-01T10:00:00Z', location: '', confirmation_send_on: 'agenda_confirm' } },
    });
    expect(await renderLinkedEmail(db, row)).toMatchObject({ kind: 'cancel' });
    expect(await renderLinkedSms(db, row)).toMatchObject({ kind: 'cancel' });
  });
  it('modo de hoje com visita por confirmar nao se cancela por isto', async () => {
    const { renderLinkedSms } = await import('../reminderRunner');
    const db = tableDb({
      schedule_items: { data: { status: 'scheduled', start_datetime: '2026-12-01T10:00:00Z', location: '', confirmation_send_on: null } },
      schedule_item_assignees: { data: [] },
    });
    expect(await renderLinkedSms(db, row)).toMatchObject({ kind: 'ok' });
  });
});

describe('callerCanEditSchedule (achado 6: permissao antes de aceitar o pedido do ecra)', () => {
  const client = (result: unknown) => ({ rpc: vi.fn(async () => result) });

  it('pede scheduling.items.edit ao utilizador e aceita so um true', async () => {
    const c = client({ data: true, error: null });
    expect(await callerCanEditSchedule(c, 'auth-1')).toBe(true);
    expect(c.rpc).toHaveBeenCalledWith('has_scheduling_permission', { user_id: 'auth-1', permission_code: 'scheduling.items.edit' });
  });

  it('sem permissao (false), resposta estranha, erro ou excecao: recusa', async () => {
    expect(await callerCanEditSchedule(client({ data: false, error: null }), 'a')).toBe(false);
    expect(await callerCanEditSchedule(client({ data: 'true', error: null }), 'a')).toBe(false);
    expect(await callerCanEditSchedule(client({ data: null, error: null }), 'a')).toBe(false);
    expect(await callerCanEditSchedule(client({ data: true, error: { message: 'x' } }), 'a')).toBe(false);
    expect(await callerCanEditSchedule({ rpc: async () => { throw new Error('rede'); } }, 'a')).toBe(false);
  });

  it('sem identificador do utilizador nem chega a perguntar', async () => {
    const c = client({ data: true, error: null });
    expect(await callerCanEditSchedule(c, '')).toBe(false);
    expect(c.rpc).not.toHaveBeenCalled();
  });
});
