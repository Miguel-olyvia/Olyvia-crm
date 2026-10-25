// Convites de "terminar o agendamento": resolucao e opt-out pela entidade e pela submissao.
// Supabase simulado; nada toca na base.
import { describe, expect, it } from 'vitest';
import { cancelarConvite, resolverConvite } from './schedulingInvite.ts';

const ORG = 'aaaaaaaa-0000-4000-8000-000000000001';
const FORM = 'ffffffff-0000-4000-8000-000000000003';
const ENT = 'eeeeeeee-0000-4000-8000-000000000005';
const SUB_INVITE = '99999999-0000-4000-8000-000000000007';
const SUB_LATEST = '99999999-0000-4000-8000-0000000000bb';
const NOW = new Date('2026-11-01T10:00:00Z');

type Row = Record<string, any>;

function makeSupabase(tables: Record<string, Row[]>, erros: Record<string, { message: string }> = {}) {
  const writes: Array<{ table: string; op: string; payload: any; filters: Array<[string, any]> }> = [];
  const reads: Array<{ table: string; filters: Array<[string, any]> }> = [];
  const from = (table: string) => {
    const st = { op: 'select', payload: undefined as any, filters: [] as Array<[string, any]> };
    const matches = (row: Row) =>
      st.filters.every(([c, v]) => {
        if (c.endsWith(' neq')) return row[c.slice(0, -4)] !== v;
        if (c.endsWith(' gte')) return String(row[c.slice(0, -4)]) >= String(v);
        return row[c] === v;
      });
    const b: any = {
      select: () => b,
      update: (p: any) => { st.op = 'update'; st.payload = p; return b; },
      eq: (c: string, v: any) => { st.filters.push([c, v]); return b; },
      neq: (c: string, v: any) => { st.filters.push([c + ' neq', v]); return b; },
      gte: (c: string, v: any) => { st.filters.push([c + ' gte', v]); return b; },
      order: () => b,
      limit: () => b,
      maybeSingle: () => {
        reads.push({ table, filters: st.filters });
        const error = erros[`${table}:select`] ?? null;
        return Promise.resolve({ data: error ? null : (tables[table] ?? []).find(matches) ?? null, error });
      },
      then: (res: any) => {
        writes.push({ table, op: st.op, payload: st.payload, filters: st.filters });
        return Promise.resolve({ data: null, error: erros[`${table}:${st.op}`] ?? null }).then(res);
      },
    };
    return b;
  };
  return { client: { from }, writes, reads };
}

const dados = (over: { invite?: Row; items?: Row[] } = {}) => ({
  scheduling_invites: [{
    token: 'tok', entity_id: ENT, submission_id: SUB_INVITE, form_id: FORM, step_number: 3,
    organization_id: ORG, expires_at: '2026-11-10T00:00:00Z', used_at: null, unsubscribed_at: null,
    ...over.invite,
  }],
  form_submissions: [
    { id: SUB_INVITE, organization_id: ORG, entity_id: ENT, field_values: { nome: 'Ana', _meta: { tag: 'do-convite' } }, updated_at: '2026-11-01T09:00:00Z' },
    { id: SUB_LATEST, organization_id: ORG, entity_id: ENT, field_values: { nome: 'Outra pessoa' }, updated_at: '2026-11-01T09:59:00Z' },
  ],
  schedule_items: over.items ?? [],
});

describe('resolverConvite', () => {
  it('convite valido devolve a submissao DO CONVITE e nao a mais recente da entidade', async () => {
    const s = makeSupabase(dados());
    const r = await resolverConvite({ supabase: s.client, token: 'tok', now: NOW });
    expect(r).toMatchObject({
      ok: true, form_id: FORM, step_number: 3, lead_id: SUB_INVITE, organization_id: ORG, already_booked: false,
    });
    if (r.ok) expect(r.field_values.nome).toBe('Ana');
  });

  it('a submissao e lida com filtro de organizacao', async () => {
    const s = makeSupabase(dados());
    await resolverConvite({ supabase: s.client, token: 'tok', now: NOW });
    const sub = s.reads.find((x) => x.table === 'form_submissions')!;
    expect(sub.filters).toEqual(expect.arrayContaining([['id', SUB_INVITE], ['organization_id', ORG]]));
  });

  it('entidade com visita futura nao cancelada devolve BOOKED', async () => {
    const s = makeSupabase(dados({
      items: [{ id: 'i1', entity_id: ENT, organization_id: ORG, status: 'scheduled', start_datetime: '2026-11-05T10:00:00Z' }],
    }));
    const r = await resolverConvite({ supabase: s.client, token: 'tok', now: NOW });
    expect(r).toMatchObject({ ok: false, code: 'BOOKED', already_booked: true });
    const q = s.reads.find((x) => x.table === 'schedule_items')!;
    expect(q.filters).toEqual(expect.arrayContaining([['entity_id', ENT], ['organization_id', ORG]]));
  });

  it('visita cancelada ou passada nao conta como agendada', async () => {
    const s = makeSupabase(dados({
      items: [
        { id: 'i1', entity_id: ENT, organization_id: ORG, status: 'cancelled', start_datetime: '2026-11-05T10:00:00Z' },
        { id: 'i2', entity_id: ENT, organization_id: ORG, status: 'scheduled', start_datetime: '2026-10-01T10:00:00Z' },
      ],
    }));
    const r = await resolverConvite({ supabase: s.client, token: 'tok', now: NOW });
    expect(r).toMatchObject({ ok: true, already_booked: false });
  });

  it('visita de outra organizacao nao conta', async () => {
    const s = makeSupabase(dados({
      items: [{ id: 'i1', entity_id: ENT, organization_id: 'outra-org', status: 'scheduled', start_datetime: '2026-11-05T10:00:00Z' }],
    }));
    const r = await resolverConvite({ supabase: s.client, token: 'tok', now: NOW });
    expect(r).toMatchObject({ ok: true });
  });

  it('token em falta, inexistente, usado ou expirado', async () => {
    const s = makeSupabase(dados());
    expect(await resolverConvite({ supabase: s.client, token: '', now: NOW })).toMatchObject({ ok: false, code: 'INVALID' });
    expect(await resolverConvite({ supabase: s.client, token: 'xx', now: NOW })).toMatchObject({ ok: false, code: 'INVALID' });
    const usado = makeSupabase(dados({ invite: { used_at: '2026-11-01T00:00:00Z' } }));
    expect(await resolverConvite({ supabase: usado.client, token: 'tok', now: NOW })).toMatchObject({ ok: false, code: 'USED' });
    const exp = makeSupabase(dados({ invite: { expires_at: '2026-10-31T00:00:00Z' } }));
    expect(await resolverConvite({ supabase: exp.client, token: 'tok', now: NOW })).toMatchObject({ ok: false, code: 'EXPIRED' });
  });

  it('convite sem submissao (antigo) ou com submissao apagada: INVALID', async () => {
    const sem = makeSupabase(dados({ invite: { submission_id: null } }));
    expect(await resolverConvite({ supabase: sem.client, token: 'tok', now: NOW })).toMatchObject({ ok: false, code: 'INVALID' });
    const apagada = makeSupabase({ ...dados(), form_submissions: [] });
    expect(await resolverConvite({ supabase: apagada.client, token: 'tok', now: NOW })).toMatchObject({ ok: false, code: 'INVALID' });
  });

  it('erro de base em qualquer das tres leituras devolve RETRY, nunca INVALID nem ok', async () => {
    for (const tabela of ['scheduling_invites', 'form_submissions', 'schedule_items']) {
      const s = makeSupabase(dados(), { [`${tabela}:select`]: { message: 'boom secreto' } });
      const r = await resolverConvite({ supabase: s.client, token: 'tok', now: NOW });
      expect(r, tabela).toMatchObject({ ok: false, code: 'RETRY' });
      // o texto do erro da base nao chega ao visitante
      if (!r.ok) expect(r.error).not.toContain('boom');
    }
  });

  it('nunca le anew_leads', async () => {
    const s = makeSupabase(dados());
    await resolverConvite({ supabase: s.client, token: 'tok', now: NOW });
    expect(s.reads.map((x) => x.table)).not.toContain('anew_leads');
  });
});

describe('cancelarConvite', () => {
  it('marca o convite e cancela os emails pendentes pela entidade e organizacao do convite', async () => {
    const s = makeSupabase(dados());
    const r = await cancelarConvite({ supabase: s.client, token: 'tok', now: NOW });
    expect(r).toEqual({ ok: true });
    const inv = s.writes.find((w) => w.table === 'scheduling_invites')!;
    expect(inv.payload).toHaveProperty('unsubscribed_at');
    expect(inv.filters).toEqual(expect.arrayContaining([['token', 'tok']]));
    const mail = s.writes.find((w) => w.table === 'scheduled_emails')!;
    expect(mail.payload).toEqual({ status: 'cancelled' });
    expect(mail.filters).toEqual(expect.arrayContaining([
      ['entity_type', 'lead_scheduling_invite'], ['entity_id', ENT], ['organization_id', ORG], ['status', 'pending'],
    ]));
  });

  it('idempotente: convite ja cancelado nao reescreve unsubscribed_at, mas cancela emails', async () => {
    const s = makeSupabase(dados({ invite: { unsubscribed_at: '2026-10-30T00:00:00Z' } }));
    await cancelarConvite({ supabase: s.client, token: 'tok', now: NOW });
    expect(s.writes.some((w) => w.table === 'scheduling_invites')).toBe(false);
    expect(s.writes.some((w) => w.table === 'scheduled_emails')).toBe(true);
  });

  it('token inexistente ou invalido devolve INVALID sem escrever', async () => {
    const s = makeSupabase(dados());
    expect(await cancelarConvite({ supabase: s.client, token: 'xx', now: NOW })).toMatchObject({ ok: false, code: 'INVALID' });
    expect(await cancelarConvite({ supabase: s.client, token: '', now: NOW })).toMatchObject({ ok: false, code: 'INVALID' });
    expect(s.writes).toHaveLength(0);
  });

  it('opt-out falhado NAO e confirmado: erro a marcar o convite devolve RETRY e nao toca nos emails', async () => {
    const s = makeSupabase(dados(), { 'scheduling_invites:update': { message: 'boom' } });
    const r = await cancelarConvite({ supabase: s.client, token: 'tok', now: NOW });
    expect(r).toMatchObject({ ok: false, code: 'RETRY' });
    expect(s.writes.some((w) => w.table === 'scheduled_emails')).toBe(false);
  });

  it('opt-out falhado NAO e confirmado: erro a cancelar os emails devolve RETRY', async () => {
    const s = makeSupabase(dados(), { 'scheduled_emails:update': { message: 'boom' } });
    const r = await cancelarConvite({ supabase: s.client, token: 'tok', now: NOW });
    expect(r).toMatchObject({ ok: false, code: 'RETRY' });
    if (!r.ok) expect(r.error).not.toContain('boom');
  });

  it('erro a ler o convite devolve RETRY (nao "link invalido")', async () => {
    const s = makeSupabase(dados(), { 'scheduling_invites:select': { message: 'boom' } });
    const r = await cancelarConvite({ supabase: s.client, token: 'tok', now: NOW });
    expect(r).toMatchObject({ ok: false, code: 'RETRY' });
    expect(s.writes).toHaveLength(0);
  });
});
