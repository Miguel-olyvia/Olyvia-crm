import { describe, expect, it } from 'vitest';
import { createReminderLines } from '../reminderLines';
import type { CreateReminderLinesParams } from '../reminderLines';
import type { FormEmailConfig } from '../formEmails';

const H = 3600_000;
const NOW = new Date('2026-10-01T09:00:00Z');
const START = new Date('2026-10-05T10:00:00Z').getTime();
const iso = (ms: number) => new Date(ms).toISOString();

function fakeDb() {
  const inserted: Record<string, any[]> = { scheduled_emails: [], scheduled_sms: [] };
  const db = {
    from: (table: string) => ({
      insert: (row: any) => {
        (inserted[table] ||= []).push(row);
        return Promise.resolve({ error: null });
      },
    }),
  };
  return { db, inserted };
}

function cfg(over: Partial<FormEmailConfig> = {}): FormEmailConfig {
  return {
    reminder_enabled: true,
    reminder_hours_before: 2,
    reminder_technician_enabled: null,
    reminder_technician_hours_before: null,
    reminder_template_id: null,
    reminder_technician_template_id: null,
    reminder_sms_enabled: false,
    confirmation_sms_include_link: false,
    email_smtp_id: 'smtp-1',
    email_locale_templates: null,
    primary_color: null,
    logo_url: null,
    ...over,
  } as FormEmailConfig;
}

async function run(c: FormEmailConfig, over: Partial<CreateReminderLinesParams> = {}) {
  const { db, inserted } = fakeDb();
  const res = await createReminderLines({
    supabase: db,
    organizationId: 'org-1',
    itemId: 'item-1',
    formId: 'form-1',
    locale: 'pt',
    cfg: c,
    startIso: iso(START),
    entityType: 'leads',
    entityId: 'lead-1',
    createdBy: 'user-1',
    companyName: 'Acme',
    clientVars: {
      lead_name: 'Rita Sousa',
      meeting_date: 'segunda-feira, 5 de outubro, 10:00',
      location: 'Rua A, Lisboa',
      technician_name: 'Ana',
      cancel_url: 'https://app.test/manage?token=abc',
    },
    confirmUrl: 'https://app.test/confirm?token=xyz',
    leadEmail: 'rita@x.pt',
    leadPhone: '910000000',
    address: 'Rua A, Lisboa',
    appointmentUrl: 'https://app.test/scheduling',
    technicians: [{ email: 'ana@x.pt', userId: 'u-ana', name: 'Ana' }],
    rescheduled: false,
    now: NOW,
    ...over,
  });
  const byAudience = (a: string) => inserted.scheduled_emails.filter((r) => r.audience === a);
  return { res, inserted, client: byAudience('client'), technician: byAudience('technician') };
}

describe('createReminderLines: um lembrete por destinatario', () => {
  it('sem valores do comercial, os dois seguem o cliente e saem 2h antes', async () => {
    const { res, client, technician } = await run(cfg());
    expect(res.emails).toBe(2);
    expect(client[0].scheduled_for).toBe(iso(START - 2 * H));
    expect(technician[0].scheduled_for).toBe(iso(START - 2 * H));
  });

  it('o comercial com horas proprias sai a essa hora, o cliente a dele', async () => {
    const { client, technician } = await run(cfg({ reminder_hours_before: 24, reminder_technician_hours_before: 6 }));
    expect(client[0].scheduled_for).toBe(iso(START - 24 * H));
    expect(technician[0].scheduled_for).toBe(iso(START - 6 * H));
  });

  it('comercial desligado: so o cliente recebe', async () => {
    const { res, client, technician } = await run(cfg({ reminder_technician_enabled: false }));
    expect(res.emails).toBe(1);
    expect(client).toHaveLength(1);
    expect(technician).toHaveLength(0);
  });

  it('cliente desligado com o comercial ligado: so o comercial recebe, e sem SMS', async () => {
    const { res, client, technician, inserted } = await run(
      cfg({ reminder_enabled: false, reminder_technician_enabled: true, reminder_sms_enabled: true }),
    );
    expect(res.emails).toBe(1);
    expect(res.sms).toBe(0);
    expect(client).toHaveLength(0);
    expect(technician).toHaveLength(1);
    expect(inserted.scheduled_sms).toHaveLength(0);
  });

  it('tudo desligado: nao cria nada', async () => {
    const { res } = await run(cfg({ reminder_enabled: false }));
    expect(res).toMatchObject({ emails: 0, sms: 0 });
    expect(res.skipped).toBeTruthy();
  });

  it('a hora de um ja passou e a do outro nao: so cria o que ainda vai a tempo', async () => {
    // Visita daqui a 5h: cliente 2h antes (a tempo), comercial 24h antes (passou).
    const soon = NOW.getTime() + 5 * H;
    const { client, technician } = await run(cfg({ reminder_technician_hours_before: 24 }), { startIso: iso(soon) });
    expect(client).toHaveLength(1);
    expect(technician).toHaveLength(0);
  });

  it('o SMS segue a regra do cliente', async () => {
    const { res, inserted } = await run(cfg({ reminder_sms_enabled: true, reminder_hours_before: 24, reminder_technician_hours_before: 6 }));
    expect(res.sms).toBe(1);
    expect(inserted.scheduled_sms[0].scheduled_for).toBe(iso(START - 24 * H));
  });
});

describe('createReminderLines: o texto de cada lado', () => {
  it('o comercial nunca recebe «a sua visita» nem os links do cliente', async () => {
    const { technician } = await run(cfg());
    const row = technician[0];
    expect(row.subject).not.toMatch(/sua visita/i);
    expect(row.body_html).not.toMatch(/sua visita/i);
    expect(row.body_html).not.toContain('manage?token');
    expect(row.body_html).not.toContain('confirm?token');
    expect(row.body_html).toContain('910000000');
    expect(row.body_html).toContain('Abrir na agenda');
    expect(row.content_vars.cancel_url).toBe('');
    expect(row.content_vars.confirm_url).toBe('');
  });

  it('o cliente recebe o texto dele, com os links dele e sem dados da agenda', async () => {
    const { client } = await run(cfg());
    const row = client[0];
    expect(row.subject).toContain('Lembrete da sua visita');
    expect(row.body_html).toContain('manage?token=abc');
    expect(row.body_html).toContain('confirm?token=xyz');
    expect(row.body_html).not.toContain('Abrir na agenda');
  });
});
