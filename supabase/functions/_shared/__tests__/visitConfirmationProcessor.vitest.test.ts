import { describe, expect, it, vi } from 'vitest';
import { processClaimedRows } from '../visitConfirmationProcessor';
import type { ClaimedConfirmationRow, ProcessorDeps } from '../visitConfirmationProcessor';

type Row = Record<string, unknown>;
type Filter = (r: Row) => boolean;

/** Base em memoria com o subconjunto do PostgREST que o processador usa. */
function memoryDb(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = {};
  for (const [k, v] of Object.entries(seed)) tables[k] = v.map((r) => ({ ...r }));
  let seq = 0;

  const from = (table: string) => {
    const rows = () => (tables[table] ||= []);
    const filters: Filter[] = [];
    let mode: 'select' | 'update' | 'insert' = 'select';
    let patch: Row = {};
    let inserted: Row[] = [];
    let limitN: number | null = null;

    const run = () => {
      if (mode === 'insert') return { data: inserted, error: null };
      const hit = rows().filter((r) => filters.every((f) => f(r)));
      if (mode === 'update') {
        hit.forEach((r) => Object.assign(r, patch));
        return { data: hit, error: null };
      }
      return { data: limitN === null ? hit : hit.slice(0, limitN), error: null };
    };

    const b: Record<string, unknown> = {
      select: () => b,
      eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return b; },
      neq: (c: string, v: unknown) => { filters.push((r) => r[c] !== v); return b; },
      in: (c: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[c])); return b; },
      is: (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) === v); return b; },
      gt: (c: string, v: string) => { filters.push((r) => String(r[c]) > v); return b; },
      order: () => b,
      limit: (n: number) => { limitN = n; return b; },
      update: (p: Row) => { mode = 'update'; patch = p; return b; },
      insert: (r: Row | Row[]) => {
        mode = 'insert';
        inserted = (Array.isArray(r) ? r : [r]).map((x) => ({ id: `${table}-${++seq}`, token: `tok-${seq}`, ...x }));
        rows().push(...inserted);
        return b;
      },
      maybeSingle: () => {
        const { data } = run();
        return Promise.resolve({ data: data[0] ?? null, error: null });
      },
      single: () => {
        const { data } = run();
        return Promise.resolve({ data: data[0] ?? null, error: data[0] ? null : { message: 'no row' } });
      },
      then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(run()).then(ok, ko),
    };
    return b;
  };
  return { db: { from }, tables };
}

const NOW = new Date('2026-11-23T10:00:00Z');
const START = '2026-11-30T10:00:00.000Z';
const ORG = 'org-1';

function seed(over: { item?: Row; branding?: Row; lead?: Row; noForm?: boolean } = {}) {
  return {
    schedule_items: [{
      id: 'item-1', organization_id: ORG, status: 'confirmed', start_datetime: START, location: 'Rua A',
      metadata: over.noForm ? { lead_id: 'lead-1' } : { form_id: 'form-1', lead_id: 'lead-1' },
      lead_id: 'lead-1', client_id: null, confirmation_send_on: 'agenda_confirm', time_off_type: null, created_by: 'u-admin',
      ...(over.item ?? {}),
    }],
    forms: [{ id: 'form-1', organization_id: ORG, settings: {} }],
    form_branding: [{
      form_id: 'form-1', confirmation_email_enabled: true, confirmation_email_template_id: null,
      confirmation_sms_enabled: true, confirmation_sms_message: null, confirmation_sms_include_link: false,
      reminder_enabled: true, reminder_hours_before: 2, reminder_sms_enabled: false, email_smtp_id: 'smtp-form',
      email_locale_templates: null, booking_manage_url_template: null, primary_color: null, logo_url: null,
      ...(over.branding ?? {}),
    }],
    anew_leads: [{
      id: 'lead-1', organization_id: ORG, locale: 'pt', created_by: 'u-lead', assigned_to: 'u-ana',
      field_values: { first_name: 'Rita', last_name: 'Sousa', email: 'rita@x.pt', phone: '+351910000000' },
      ...(over.lead ?? {}),
    }],
    anew_organizations: [{ id: ORG, name: 'Acme' }],
    schedule_settings: [{ organization_id: ORG, notify_client_smtp_id: 'smtp-org', notify_client_sms_include_link: false }],
    schedule_item_assignees: [{ item_id: 'item-1', resource_id: 'res-1' }],
    schedule_resources: [{ id: 'res-1', name: 'Ana', user_id: 'u-ana' }],
    anew_users: [{ id: 'u-ana', email: 'ana@x.pt', name: 'Ana', auth_user_id: 'auth-ana' }],
    booking_tokens: [],
    scheduled_emails: [{ id: 'old-rem', schedule_item_id: 'item-1', status: 'pending' }],
    scheduled_sms: [],
    sms_logs: [],
    notifications: [],
    visit_confirmation_sends: [] as Row[],
  };
}

function claimed(channel: 'email' | 'sms', over: Partial<ClaimedConfirmationRow> = {}): ClaimedConfirmationRow {
  return {
    id: `q-${channel}`, organization_id: ORG, schedule_item_id: 'item-1', channel, kind: 'auto',
    visit_start_snapshot: START, attempts: 1, ...over,
  };
}

function setup(s: ReturnType<typeof seed>, opts: { emailOk?: boolean; smsOk?: boolean; smsError?: string } = {}) {
  const { db, tables } = memoryDb(s);
  for (const r of [claimed('email'), claimed('sms')]) tables.visit_confirmation_sends.push({ ...r, status: 'sending' });
  const sendEmail = vi.fn(async () => (opts.emailOk === false ? { ok: false, error: 'smtp recusou' } : { ok: true }));
  const sendSms = vi.fn(async () => (opts.smsOk === false ? { ok: false, error: opts.smsError ?? 'numero invalido' } : { ok: true }));
  const createReminders = vi.fn(async () => ({ emails: 2, sms: 0 }));
  const deps: ProcessorDeps = { supabase: db, sendEmail, sendSms, createReminders, siteUrl: 'https://app.test', now: () => NOW };
  const q = (id: string) => tables.visit_confirmation_sends.find((r) => r.id === id) as Row;
  return { deps, tables, sendEmail, sendSms, createReminders, q };
}

describe('processClaimedRows: a empresa confirmou, sai a confirmacao', () => {
  it('envia email e SMS, marca enviados, regista o SMS e cria os lembretes uma vez', async () => {
    const t = setup(seed());
    const res = await processClaimedRows([claimed('email'), claimed('sms')], t.deps);
    expect(res.sent).toBe(2);
    expect(t.sendEmail).toHaveBeenCalledTimes(1);
    expect(t.sendEmail.mock.calls[0][0]).toMatchObject({ organizationId: ORG, smtpId: 'smtp-form', to: 'rita@x.pt' });
    expect(t.sendSms.mock.calls[0][0]).toMatchObject({ toPhone: '+351910000000' });
    expect(t.q('q-email')).toMatchObject({ status: 'sent', recipient: 'rita@x.pt' });
    expect(t.q('q-sms')).toMatchObject({ status: 'sent' });
    expect(t.tables.sms_logs).toHaveLength(1);
    expect(t.tables.sms_logs[0]).toMatchObject({ status: 'sent', entity_type: 'leads', entity_id: 'lead-1' });
    // lembretes antigos ligados a visita cancelados e criados de novo, uma so vez
    expect(t.tables.scheduled_emails.find((r) => r.id === 'old-rem')?.status).toBe('cancelled');
    expect(t.createReminders).toHaveBeenCalledTimes(1);
    const remArgs = t.createReminders.mock.calls[0][0] as Record<string, unknown>;
    expect(remArgs).toMatchObject({ itemId: 'item-1', formId: 'form-1', startIso: START, entityId: 'lead-1', createdBy: 'u-lead' });
    expect(String(remArgs.confirmUrl)).toContain('/booking/confirm?token=');
  });

  it('o link de gerir usa um token de cancelar valido (cria-o se nao existir)', async () => {
    const t = setup(seed());
    await processClaimedRows([claimed('email')], t.deps);
    expect(t.tables.booking_tokens.some((r) => r.action === 'cancel')).toBe(true);
  });

  it('um reenvio nao recria os lembretes', async () => {
    const t = setup(seed());
    await processClaimedRows([claimed('email', { kind: 'resend' })], t.deps);
    expect(t.sendEmail).toHaveBeenCalledTimes(1);
    expect(t.createReminders).not.toHaveBeenCalled();
  });

  it('uma nova tentativa (attempts > 1) nao recria os lembretes', async () => {
    const t = setup(seed());
    await processClaimedRows([claimed('sms', { attempts: 2 })], t.deps);
    expect(t.createReminders).not.toHaveBeenCalled();
  });
});

describe('processClaimedRows: nao envia', () => {
  it('visita que deixou de estar confirmada', async () => {
    const t = setup(seed({ item: { status: 'scheduled' } }));
    const res = await processClaimedRows([claimed('email'), claimed('sms')], t.deps);
    expect(res.skipped).toBe(2);
    expect(t.sendEmail).not.toHaveBeenCalled();
    expect(t.q('q-email')).toMatchObject({ status: 'skipped', skip_reason: 'not_confirmed' });
    expect(t.createReminders).not.toHaveBeenCalled();
  });

  it('visita no modo de hoje (booking) nunca recebe pela fila', async () => {
    const t = setup(seed({ item: { confirmation_send_on: null } }));
    await processClaimedRows([claimed('email')], t.deps);
    expect(t.sendEmail).not.toHaveBeenCalled();
    expect(t.q('q-email').status).toBe('skipped');
  });

  it('a hora mudou depois de enfileirada: a linha antiga nao sai', async () => {
    const t = setup(seed({ item: { start_datetime: '2026-12-01T10:00:00.000Z' } }));
    await processClaimedRows([claimed('email')], t.deps);
    expect(t.sendEmail).not.toHaveBeenCalled();
    expect(t.q('q-email').skip_reason).toBe('time_changed');
  });

  it('visita ja passada', async () => {
    const t = setup(seed({ item: { start_datetime: '2026-11-20T10:00:00.000Z' } }));
    await processClaimedRows([claimed('email', { visit_start_snapshot: '2026-11-20T10:00:00.000Z' })], t.deps);
    expect(t.sendEmail).not.toHaveBeenCalled();
  });

  it('canal desligado no formulario fica saltado com o motivo', async () => {
    const t = setup(seed({ branding: { confirmation_sms_enabled: false } }));
    await processClaimedRows([claimed('email'), claimed('sms')], t.deps);
    expect(t.sendSms).not.toHaveBeenCalled();
    expect(t.q('q-sms')).toMatchObject({ status: 'skipped' });
    expect(t.q('q-sms').skip_reason).toBe('sms_disabled');
    expect(t.q('q-email').status).toBe('sent');
  });

  it('sem contacto: saltado com «sem email» / «sem telefone»', async () => {
    const t = setup(seed({ lead: { field_values: { first_name: 'Rita' } } }));
    await processClaimedRows([claimed('email'), claimed('sms')], t.deps);
    expect(t.q('q-email')).toMatchObject({ status: 'skipped', skip_reason: 'no_email' });
    expect(t.q('q-sms')).toMatchObject({ status: 'skipped', skip_reason: 'no_phone' });
  });
});

describe('processClaimedRows: falhas', () => {
  it('falha antes do maximo volta a fila com o erro guardado', async () => {
    const t = setup(seed(), { smsOk: false });
    const res = await processClaimedRows([claimed('sms')], t.deps);
    expect(res.retried).toBe(1);
    expect(t.q('q-sms')).toMatchObject({ status: 'pending', error_message: 'numero invalido' });
    expect(t.tables.sms_logs[0]).toMatchObject({ status: 'failed', error_message: 'numero invalido' });
  });

  it('a ultima tentativa falhada fica falhada e avisa o comercial no sino', async () => {
    const t = setup(seed(), { emailOk: false });
    const res = await processClaimedRows([claimed('email', { attempts: 3 })], t.deps);
    expect(res.failed).toBe(1);
    expect(t.q('q-email')).toMatchObject({ status: 'failed', error_message: 'smtp recusou' });
    expect(t.tables.notifications).toHaveLength(1);
    expect(t.tables.notifications[0]).toMatchObject({ user_id: 'auth-ana', organization_id: ORG, entity_id: 'item-1' });
  });
});

describe('processClaimedRows: visitas criadas no CRM (sem formulario)', () => {
  it('usa o SMTP da Agenda e o texto por omissao, sem lembretes', async () => {
    const t = setup(seed({ noForm: true }));
    await processClaimedRows([claimed('email'), claimed('sms')], t.deps);
    expect(t.sendEmail.mock.calls[0][0]).toMatchObject({ smtpId: 'smtp-org', to: 'rita@x.pt' });
    expect(t.sendSms).toHaveBeenCalledTimes(1);
    expect(t.createReminders).not.toHaveBeenCalled();
  });
});
