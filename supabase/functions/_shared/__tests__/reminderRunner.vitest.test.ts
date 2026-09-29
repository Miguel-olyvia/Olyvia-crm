import { beforeAll, describe, expect, it } from 'vitest';
import {
  cancelLegacyVisitReminders,
  loadVisitTechnicians,
  reconcileDrift,
  reconcileDueItems,
  reconcileItem,
  renderLinkedEmail,
  renderLinkedSms,
} from '../reminderRunner';

// ---- base de dados simulada, em memoria -----------------------------------
type Row = Record<string, any>;

function makeDb(
  tables: Record<string, Row[]>,
  rpcs: Record<string, (args: any) => any> = {},
  /** Tabelas cuja LEITURA devolve erro. */
  readErrors: Record<string, { message: string }> = {},
) {
  let seq = 0;
  const builder = (name: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    let op: 'select' | 'update' | 'insert' | 'upsert' = 'select';
    let payload: any = null;
    let single = false;
    const rows = () => (tables[name] ||= []);
    const run = () => {
      if (op === 'upsert') {
        const list = Array.isArray(payload) ? payload : [payload];
        list.forEach((p) => {
          const hit = rows().find((r) => r.item_id === p.item_id && r.email === p.email);
          if (hit) Object.assign(hit, p); else rows().push({ id: `new-${++seq}`, ...p });
        });
        return { data: null, error: null };
      }
      if (op === 'select' && readErrors[name]) return { data: null, error: readErrors[name] };
      if (op === 'insert') {
        const list = Array.isArray(payload) ? payload : [payload];
        list.forEach((p) => rows().push({ id: `new-${++seq}`, ...p }));
        return { data: null, error: null };
      }
      const hit = rows().filter((r) => filters.every((f) => f(r)));
      if (op === 'update') {
        hit.forEach((r) => Object.assign(r, payload));
        return { data: null, error: null };
      }
      const data = hit.map((r) => ({ ...r }));
      return { data: single ? (data[0] ?? null) : data, error: null };
    };
    const api: any = {
      select: () => api,
      update: (p: any) => { op = 'update'; payload = p; return api; },
      insert: (p: any) => { op = 'insert'; payload = p; return api; },
      upsert: (p: any) => { op = 'upsert'; payload = p; return api; },
      eq: (c: string, v: any) => { filters.push((r) => r[c] === v); return api; },
      in: (c: string, vs: any[]) => { filters.push((r) => vs.includes(r[c])); return api; },
      is: (c: string, v: any) => { filters.push((r) => (r[c] ?? null) === v); return api; },
      order: () => api,
      limit: () => api,
      maybeSingle: () => { single = true; return Promise.resolve(run()); },
      single: () => { single = true; return Promise.resolve(run()); },
      then: (res: any, rej: any) => Promise.resolve(run()).then(res, rej),
    };
    return api;
  };
  return {
    tables,
    from: (n: string) => builder(n),
    rpc: (fn: string, args: any) => Promise.resolve({ data: rpcs[fn]?.(args) ?? [], error: null }),
  };
}

const H = 3600_000;
const NOW = new Date('2026-10-01T09:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();
const START = new Date('2026-10-02T10:00:00Z').getTime();
const ITEM = 'item-1';

const CLIENT_VARS = {
  lead_name: 'Rita', client_name: 'Rita', lead_email: 'rita@x.pt', client_email: 'rita@x.pt',
  lead_phone: '+351900', company_name: 'Acme', technician_name: 'Ana',
  meeting_date: 'antiga', meeting_datetime: 'antiga', location: 'Rua A',
  cancel_url: 'https://app/booking/manage?token=t', confirm_url: 'https://app/booking/confirm?token=c',
};

function world(
  over: { itemStatus?: string; itemStart?: number; techs?: string[]; formHours?: number; readErrors?: Record<string, { message: string }> } = {},
) {
  const techs = over.techs ?? ['ana'];
  const users: Row[] = [
    { id: 'u-ana', email: 'ana@x.pt', name: 'Ana' },
    { id: 'u-bruno', email: 'bruno@x.pt', name: 'Bruno' },
  ];
  return makeDb({
    schedule_items: [{
      id: ITEM, status: over.itemStatus ?? 'scheduled', start_datetime: iso(over.itemStart ?? START),
      location: 'Rua B', metadata: { form_id: 'form-1' }, organization_id: 'org-1',
    }],
    schedule_item_assignees: techs.map((t) => ({ item_id: ITEM, resource_id: `r-${t}` })),
    schedule_resources: [
      { id: 'r-ana', name: 'Ana R', user_id: 'u-ana' },
      { id: 'r-bruno', name: 'Bruno R', user_id: 'u-bruno' },
    ],
    anew_users: users,
    form_branding: [{
      form_id: 'form-1', reminder_enabled: true, reminder_hours_before: over.formHours ?? 2,
      primary_color: null, logo_url: null, email_smtp_id: 'smtp-1', email_locale_templates: {},
    }],
    email_templates: [],
    booking_tokens: [
      { id: 'tk1', schedule_item_id: ITEM, action: 'confirm', expires_at: iso(START), used_at: null },
      { id: 'tk2', schedule_item_id: ITEM, action: 'cancel', expires_at: iso(START + 24 * H), used_at: null },
      { id: 'tk3', schedule_item_id: ITEM, action: 'confirm', expires_at: iso(START), used_at: '2026-09-30T00:00:00Z' },
    ],
    scheduled_emails: [
      {
        id: 'e-client', schedule_item_id: ITEM, audience: 'client', to_email: 'rita@x.pt', status: 'pending',
        scheduled_for: iso(START - 2 * H), visit_start_snapshot: iso(START), form_id: 'form-1', locale: 'pt',
        content_vars: CLIENT_VARS, entity_type: 'leads', entity_id: 'lead-1', user_id: 'u-creator', organization_id: 'org-1',
        template_id: null,
      },
      {
        id: 'e-ana', schedule_item_id: ITEM, audience: 'technician', to_email: 'ana@x.pt', status: 'pending',
        scheduled_for: iso(START - 2 * H), visit_start_snapshot: iso(START), form_id: 'form-1', locale: 'pt',
        content_vars: { ...CLIENT_VARS, cancel_url: '', confirm_url: '' }, entity_type: 'leads', entity_id: 'lead-1',
        user_id: 'u-ana', organization_id: 'org-1', template_id: null,
      },
    ],
    scheduled_sms: [
      {
        id: 's-client', schedule_item_id: ITEM, audience: 'client', to_phone: '+351900', status: 'pending',
        scheduled_for: iso(START - 2 * H), visit_start_snapshot: iso(START), form_id: 'form-1',
        content_vars: CLIENT_VARS, entity_type: 'leads', entity_id: 'lead-1', organization_id: 'org-1',
        message: 'Acme: lembrete da sua visita para {{meeting_date}}.',
      },
    ],
  }, {}, over.readErrors ?? {});
}

const byId = (db: ReturnType<typeof makeDb>, table: string, id: string) =>
  db.tables[table].find((r) => r.id === id)!;

beforeAll(() => {
  (globalThis as any).Deno = { env: { get: () => undefined } };
});

describe('reconcileItem', () => {
  it('sem mudancas: nao escreve nada', async () => {
    const db = world();
    const before = JSON.stringify(db.tables);
    const s = await reconcileItem(db, ITEM, NOW);
    expect(s).toMatchObject({ cancelled: 0, moved: 0, created: 0 });
    expect(JSON.stringify(db.tables)).toBe(before);
  });

  it('visita cancelada: cancela os lembretes pendentes (email e SMS) com motivo', async () => {
    const db = world({ itemStatus: 'cancelled' });
    db.tables.scheduled_emails.push({ id: 'e-old', schedule_item_id: ITEM, audience: 'client', to_email: 'x@x.pt', status: 'sent', scheduled_for: iso(START), visit_start_snapshot: iso(START) });
    const s = await reconcileItem(db, ITEM, NOW);
    expect(s.cancelled).toBe(3);
    for (const [t, id] of [['scheduled_emails', 'e-client'], ['scheduled_emails', 'e-ana'], ['scheduled_sms', 's-client']]) {
      expect(byId(db, t, id)).toMatchObject({ status: 'cancelled', cancel_reason: expect.stringContaining('cancelada') });
    }
    expect(byId(db, 'scheduled_emails', 'e-old').status).toBe('sent');
  });

  it('visita apagada: cancela tudo', async () => {
    const db = world();
    db.tables.schedule_items.length = 0;
    const s = await reconcileItem(db, ITEM, NOW);
    expect(s.cancelled).toBe(3);
  });

  it('visita movida um dia: lembretes passam a sair X horas antes da nova data (X = formulario actual)', async () => {
    const later = START + 24 * H;
    const db = world({ itemStart: later, formHours: 24 });
    const s = await reconcileItem(db, ITEM, NOW);
    expect(s.moved).toBe(3);
    for (const [t, id] of [['scheduled_emails', 'e-client'], ['scheduled_emails', 'e-ana'], ['scheduled_sms', 's-client']]) {
      const r = byId(db, t, id);
      expect(r.status).toBe('pending');
      expect(r.scheduled_for).toBe(iso(later - 24 * H));
      expect(r.visit_start_snapshot).toBe(iso(later));
    }
    // os links acompanham a visita; o ja usado nao se mexe
    expect(byId(db, 'booking_tokens', 'tk1').expires_at).toBe(iso(later));
    expect(byId(db, 'booking_tokens', 'tk2').expires_at).toBe(iso(later + 24 * H));
    expect(byId(db, 'booking_tokens', 'tk3').expires_at).toBe(iso(START));
  });

  it('a hora nova do lembrete ja passou: cancela com motivo, nunca envia logo', async () => {
    const soon = NOW.getTime() + 1 * H;
    const db = world({ itemStart: soon });
    const s = await reconcileItem(db, ITEM, NOW);
    expect(s.cancelled).toBe(3);
    expect(byId(db, 'scheduled_emails', 'e-client').cancel_reason).toContain('já passou');
    expect(db.tables.scheduled_emails.filter((r) => r.status === 'pending')).toHaveLength(0);
  });

  it('troca de comercial: cancela o do antigo e cria o do novo, com a hora e o nome actuais', async () => {
    const db = world({ techs: ['bruno'] });
    const s = await reconcileItem(db, ITEM, NOW);
    expect(s).toMatchObject({ cancelled: 1, created: 1, moved: 0 });
    expect(byId(db, 'scheduled_emails', 'e-ana')).toMatchObject({ status: 'cancelled' });
    const created = db.tables.scheduled_emails.find((r) => r.to_email === 'bruno@x.pt')!;
    expect(created).toMatchObject({
      status: 'pending',
      schedule_item_id: ITEM,
      audience: 'technician',
      user_id: 'u-bruno',
      entity_type: 'leads',
      entity_id: 'lead-1',
      scheduled_for: iso(START - 2 * H),
      visit_start_snapshot: iso(START),
      smtp_id: 'smtp-1',
    });
    expect(created.content_vars.technician_name).toBe('Bruno');
    expect(created.content_vars.cancel_url).toBe('');
    expect(created.subject).toContain('Lembrete');
  });

  it('varios comerciais: o lembrete vai a TODOS, sem duplicar o que ja existe', async () => {
    const db = world({ techs: ['ana', 'bruno'] });
    const s = await reconcileItem(db, ITEM, NOW);
    expect(s).toMatchObject({ cancelled: 0, created: 1 });
    expect(db.tables.scheduled_emails.filter((r) => r.audience === 'technician' && r.status === 'pending')
      .map((r) => r.to_email).sort()).toEqual(['ana@x.pt', 'bruno@x.pt']);
    // idempotente: uma segunda passagem nao cria outro
    const again = await reconcileItem(db, ITEM, NOW);
    expect(again.created).toBe(0);
    expect(db.tables.scheduled_emails).toHaveLength(3);
  });

  it('linhas religadas sem variaveis guardadas: o do comercial acrescentado reconstroi-se da ficha da lead', async () => {
    const db = world({ techs: ['ana', 'bruno'] });
    db.tables.scheduled_emails.forEach((r) => { r.content_vars = null; });
    db.tables.anew_leads = [{ id: 'lead-1', field_values: { email: 'rita@x.pt', first_name: 'Rita', last_name: 'Sousa', phone: '+351900' } }];
    db.tables.anew_organizations = [{ id: 'org-1', name: 'Acme' }];
    const s = await reconcileItem(db, ITEM, NOW);
    expect(s.created).toBe(1);
    const created = db.tables.scheduled_emails.find((r) => r.to_email === 'bruno@x.pt')!;
    expect(created.content_vars).toMatchObject({ lead_name: 'Rita Sousa', lead_phone: '+351900', company_name: 'Acme', technician_name: 'Bruno' });
  });

  it('linha pendente sem lembretes (so linhas enviadas) nao faz nada', async () => {
    const db = world({ itemStatus: 'cancelled' });
    db.tables.scheduled_emails.forEach((r) => { r.status = 'sent'; });
    db.tables.scheduled_sms.forEach((r) => { r.status = 'sent'; });
    const s = await reconcileItem(db, ITEM, NOW);
    expect(s.items).toBe(0);
  });
});

describe('reconcileItem: um erro de leitura nunca e ausencia', () => {
  it('erro a ler a visita: aborta (lanca) e NAO cancela nem move nada', async () => {
    const db = world({ readErrors: { schedule_items: { message: 'timeout' } } });
    const before = JSON.stringify(db.tables);
    await expect(reconcileItem(db, ITEM, NOW)).rejects.toThrow(/schedule_items/);
    expect(JSON.stringify(db.tables)).toBe(before);
  });

  it('erro a ler as linhas de email ou SMS: aborta sem tocar em nada', async () => {
    for (const t of ['scheduled_emails', 'scheduled_sms']) {
      const db = world({ readErrors: { [t]: { message: 'boom' } } });
      const before = JSON.stringify(db.tables);
      await expect(reconcileItem(db, ITEM, NOW)).rejects.toThrow(t);
      expect(JSON.stringify(db.tables)).toBe(before);
    }
  });

  it('erro a ler os comerciais: aborta, nao cancela os lembretes dos comerciais como "retirados"', async () => {
    for (const t of ['schedule_item_assignees', 'schedule_resources', 'anew_users']) {
      const db = world({ readErrors: { [t]: { message: 'boom' } } });
      const before = JSON.stringify(db.tables);
      await expect(reconcileItem(db, ITEM, NOW)).rejects.toThrow(t);
      expect(JSON.stringify(db.tables)).toBe(before);
      expect(db.tables.scheduled_emails.every((r) => r.status === 'pending')).toBe(true);
    }
  });

  it('loadVisitTechnicians lanca em erro em vez de devolver []', async () => {
    const db = world({ readErrors: { schedule_item_assignees: { message: 'boom' } } });
    await expect(loadVisitTechnicians(db, ITEM)).rejects.toThrow();
  });

  it('reconcileDueItems devolve as visitas que falharam e trata as outras', async () => {
    const db = world({ itemStatus: 'cancelled' });
    const w2 = world({ readErrors: { schedule_items: { message: 'x' } } });
    const failed = await reconcileDueItems(w2, [ITEM], NOW);
    expect([...failed]).toEqual([ITEM]);
    const ok = await reconcileDueItems(db, [ITEM], NOW);
    expect(ok.size).toBe(0);
    expect(db.tables.scheduled_emails.every((r) => r.status === 'cancelled')).toBe(true);
  });

  it('reconcileDrift: uma visita que falha nao impede as outras e conta como erro', async () => {
    const db = world({ itemStatus: 'cancelled' });
    db.tables.schedule_items.push({ id: 'item-2', status: 'scheduled', start_datetime: iso(START), location: '', metadata: {}, organization_id: 'org-1' });
    const realFrom = db.from;
    (db as any).from = (n: string) => {
      const b = realFrom(n);
      if (n === 'schedule_items') {
        const origEq = b.eq;
        b.eq = (c: string, v: any) => {
          if (c === 'id' && v === 'item-2') { b.maybeSingle = () => Promise.resolve({ data: null, error: { message: 'x' } }); return b; }
          return origEq(c, v);
        };
      }
      return b;
    };
    (db as any).rpc = () => Promise.resolve({ data: [{ out_item_id: 'item-2' }, { out_item_id: ITEM }], error: null });
    const s = await reconcileDrift(db, NOW);
    expect(s).toMatchObject({ errors: 1, cancelled: 3 });
  });
});

describe('reconcileItem: linhas religadas sem variaveis guardadas', () => {
  const legacy = (over: { techs?: string[] } = {}) => {
    const later = START + 24 * H;
    const db = world({ itemStart: later, formHours: 24, ...over });
    db.tables.scheduled_emails.forEach((r) => {
      r.content_vars = null;
      r.subject = 'Lembrete: reunião sexta 2 de outubro';
      r.body_html = '<p>sexta 2 de outubro</p>';
    });
    db.tables.scheduled_sms.forEach((r) => {
      r.content_vars = null;
      r.message = 'Acme: lembrete da sua visita para sexta 2 de outubro.';
    });
    db.tables.anew_leads = [{ id: 'lead-1', field_values: { email: 'rita@x.pt', first_name: 'Rita', last_name: 'Sousa', phone: '+351900' } }];
    db.tables.anew_organizations = [{ id: 'org-1', name: 'Acme' }];
    return { db, later };
  };

  it('ao mover a hora, refaz assunto, corpo e SMS com a data NOVA (nunca fica texto com a data antiga)', async () => {
    const { db, later } = legacy();
    const s = await reconcileItem(db, ITEM, NOW);
    expect(s.moved).toBe(3);
    const mail = byId(db, 'scheduled_emails', 'e-client');
    expect(mail.scheduled_for).toBe(iso(later - 24 * H));
    expect(mail.content_vars).toBeTruthy();
    expect(mail.subject).not.toContain('2 de outubro');
    expect(mail.body_html).toContain('3 de outubro');
    const sms = byId(db, 'scheduled_sms', 's-client');
    expect(sms.message).toContain('{{meeting_date}}');
    expect(sms.content_vars).toBeTruthy();
    // e o envio ja monta com a data actual
    const out = await renderLinkedSms(db, sms);
    expect(out).toMatchObject({ kind: 'ok' });
    expect((out as any).value).toContain('3 de outubro');
  });

  it('sem maneira de refazer o texto (entidade que nao e lead): cancela com motivo em vez de mover', async () => {
    const { db } = legacy();
    db.tables.scheduled_emails.forEach((r) => { r.entity_type = 'clients'; });
    const s = await reconcileItem(db, ITEM, NOW);
    expect(byId(db, 'scheduled_emails', 'e-client')).toMatchObject({ status: 'cancelled', cancel_reason: expect.stringContaining('data antiga') });
    expect(byId(db, 'scheduled_emails', 'e-ana').status).toBe('cancelled');
    expect(s.cancelled).toBeGreaterThanOrEqual(2);
  });
});

describe('travao do lembrete do comercial que nao se consegue criar', () => {
  it('regista a tentativa (para a base nao voltar a propor a visita de imediato)', async () => {
    const db = world({ techs: ['ana', 'bruno'] });
    db.tables.form_branding = [];
    const s = await reconcileItem(db, ITEM, NOW);
    expect(s.created).toBe(0);
    expect(db.tables.reminder_create_attempts).toBeUndefined();
    // com formulario mas sem molde utilizavel
    const db2 = world({ techs: ['ana', 'bruno'] });
    db2.tables.scheduled_emails.forEach((r) => { r.content_vars = null; r.entity_type = 'clients'; });
    const s2 = await reconcileItem(db2, ITEM, NOW);
    expect(s2.created).toBe(0);
    expect(db2.tables.reminder_create_attempts).toEqual([
      expect.objectContaining({ item_id: ITEM, email: 'bruno@x.pt' }),
    ]);
  });
});

describe('reconcileDrift', () => {
  it('acerta cada visita que a base aponta como desalinhada', async () => {
    const db = makeDb({}, {});
    const w = world({ itemStatus: 'cancelled' });
    Object.assign(db.tables, w.tables);
    (db as any).rpc = () => Promise.resolve({ data: [{ out_item_id: ITEM }, { out_item_id: null }], error: null });
    const s = await reconcileDrift(db, NOW);
    expect(s).toMatchObject({ items: 1, cancelled: 3 });
  });
});

describe('renderLinkedEmail / renderLinkedSms', () => {
  it('monta o email com a hora e o comercial ACTUAIS, nao os da marcacao', async () => {
    const later = START + 48 * H;
    const db = world({ itemStart: later, techs: ['bruno'] });
    const res = await renderLinkedEmail(db, db.tables.scheduled_emails[0]);
    expect(res.kind).toBe('ok');
    const mail = (res as any).value as { subject: string; html: string };
    expect(mail.subject).not.toContain('antiga');
    expect(mail.html).not.toContain('antiga');
    expect(mail.html).toContain('Bruno');
    expect(mail.html).toContain('outubro');
    expect(mail.html).toContain('Rua B');
  });

  it('linha sem variaveis guardadas (nunca movida): usa o conteudo guardado', async () => {
    const db = world();
    expect(await renderLinkedEmail(db, { ...db.tables.scheduled_emails[0], content_vars: null })).toEqual({ kind: 'stored' });
    expect(await renderLinkedEmail(db, { ...db.tables.scheduled_emails[0], schedule_item_id: null })).toEqual({ kind: 'stored' });
  });

  it('erro a ler a visita no envio: adia (nunca envia o texto antigo)', async () => {
    const db = world({ readErrors: { schedule_items: { message: 'x' } } });
    expect(await renderLinkedEmail(db, db.tables.scheduled_emails[0])).toMatchObject({ kind: 'defer' });
    expect(await renderLinkedSms(db, db.tables.scheduled_sms[0])).toMatchObject({ kind: 'defer' });
  });

  it('erro a ler os comerciais no envio: adia', async () => {
    const db = world({ readErrors: { schedule_item_assignees: { message: 'x' } } });
    expect(await renderLinkedEmail(db, db.tables.scheduled_emails[0])).toMatchObject({ kind: 'defer' });
  });

  it('visita apagada no envio: cancela', async () => {
    const db = world();
    db.tables.schedule_items.length = 0;
    expect(await renderLinkedEmail(db, db.tables.scheduled_emails[0])).toMatchObject({ kind: 'cancel' });
    expect(await renderLinkedSms(db, db.tables.scheduled_sms[0])).toMatchObject({ kind: 'cancel' });
  });

  it('SMS ligado sem variaveis guardadas e com {{chavetas}}: nunca sai assim (cancela)', async () => {
    const db = world();
    const r = await renderLinkedSms(db, { ...db.tables.scheduled_sms[0], content_vars: null });
    expect(r).toMatchObject({ kind: 'cancel' });
  });

  it('SMS cujas variaveis nao chegam para preencher o texto: cancela em vez de enviar com chavetas', async () => {
    const db = world();
    const r = await renderLinkedSms(db, { ...db.tables.scheduled_sms[0], message: 'Ola {{nome_que_nao_existe}} {{meeting_date}}' });
    expect(r).toMatchObject({ kind: 'cancel' });
  });

  it('SMS sem chavetas e sem variaveis: usa a mensagem guardada', async () => {
    const db = world();
    const r = await renderLinkedSms(db, { ...db.tables.scheduled_sms[0], content_vars: null, message: 'texto simples' });
    expect(r).toEqual({ kind: 'stored' });
  });

  it('SMS: renderiza o texto com a data actual', async () => {
    const later = START + 48 * H;
    const db = world({ itemStart: later });
    const res = await renderLinkedSms(db, db.tables.scheduled_sms[0]);
    expect(res.kind).toBe('ok');
    const text = (res as any).value as string;
    expect(text).toMatch(/^Acme: lembrete da sua visita para .*outubro/);
    expect(text).not.toContain('{{');
  });
});

describe('cancelLegacyVisitReminders', () => {
  it('cancela os lembretes antigos nao ligados, mas nao os emails por fase nem os ligados', async () => {
    const db = makeDb({
      email_templates: [{ id: 'tpl-fase', trigger_phase: 'Proposta enviada' }, { id: 'tpl-lem', trigger_phase: null }],
      scheduled_emails: [
        { id: 'a', entity_type: 'leads', entity_id: 'L', status: 'pending', template_id: null, schedule_item_id: null },
        { id: 'b', entity_type: 'leads', entity_id: 'L', status: 'pending', template_id: 'tpl-lem', schedule_item_id: null },
        { id: 'c', entity_type: 'leads', entity_id: 'L', status: 'pending', template_id: 'tpl-fase', schedule_item_id: null },
        { id: 'd', entity_type: 'leads', entity_id: 'L', status: 'pending', template_id: null, schedule_item_id: 'item' },
        { id: 'e', entity_type: 'leads', entity_id: 'OUTRA', status: 'pending', template_id: null, schedule_item_id: null },
      ],
      scheduled_sms: [
        { id: 's', entity_type: 'leads', entity_id: 'L', status: 'pending', schedule_item_id: null },
        { id: 't', entity_type: 'leads', entity_id: 'L', status: 'pending', schedule_item_id: 'item' },
      ],
    });
    const r = await cancelLegacyVisitReminders(db, 'leads', 'L', 'motivo');
    expect(r).toEqual({ emails: 2, sms: 1 });
    const st = (t: string, id: string) => byId(db, t, id).status;
    expect(['a', 'b', 'c', 'd', 'e'].map((i) => st('scheduled_emails', i))).toEqual(['cancelled', 'cancelled', 'pending', 'pending', 'pending']);
    expect(['s', 't'].map((i) => st('scheduled_sms', i))).toEqual(['cancelled', 'pending']);
  });
});
