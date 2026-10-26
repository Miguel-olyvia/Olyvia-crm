// book-slot: pessoa, dono e escritas depois da marcacao (modelo de entidade).
// Supabase simulado; nada toca na base.
import { describe, expect, it, vi } from 'vitest';
import { makeSupabase as makeSharedSupabase } from '../_shared/__tests__/supabaseSimulado.ts';
import {
  donoDaEntidade,
  lerDefinicoesDoFormulario,
  marcarVisitaNaEntidade,
  montarItemAgenda,
  pedirMarcacaoManual,
  resolverPessoa,
  tipoParaEmail,
} from './pessoa.ts';

const ORG = 'aaaaaaaa-0000-4000-8000-000000000001';
const OTHER_ORG = 'bbbbbbbb-0000-4000-8000-000000000002';
const FORM = 'ffffffff-0000-4000-8000-000000000003';
const OTHER_FORM = 'ffffffff-0000-4000-8000-0000000000aa';
const ENT = 'eeeeeeee-0000-4000-8000-000000000005';
const SUB = '99999999-0000-4000-8000-000000000007';
const ITEM = '11111111-0000-4000-8000-000000000008';

type Row = Record<string, any>;

/** Supabase simulado: tabelas com linhas; respeita eq/is nos selects e regista escritas. */
function makeSupabase(tables: Record<string, Row[]>, erros: Record<string, { message: string }> = {}) {
  const writes: Array<{ table: string; op: string; payload: any; filters: Array<[string, any]> }> = [];
  const reads: Array<{ table: string; filters: Array<[string, any]> }> = [];
  const from = (table: string) => {
    const st = { op: 'select', payload: undefined as any, filters: [] as Array<[string, any]> };
    const matches = (row: Row) =>
      st.filters.every(([c, v]) => {
        if (c.endsWith(' is')) return (row[c.slice(0, -3)] ?? null) === v;
        return row[c] === v;
      });
    const b: any = {
      select: () => b,
      update: (p: any) => { st.op = 'update'; st.payload = p; return b; },
      insert: (p: any) => { st.op = 'insert'; st.payload = p; return b; },
      eq: (c: string, v: any) => { st.filters.push([c, v]); return b; },
      is: (c: string, v: any) => { st.filters.push([c + ' is', v]); return b; },
      maybeSingle: () => {
        reads.push({ table, filters: st.filters });
        const error = erros[`${table}:select`] ?? null;
        return Promise.resolve({ data: error ? null : (tables[table] ?? []).find(matches) ?? null, error });
      },
      then: (res: any) => {
        if (st.op === 'select') reads.push({ table, filters: st.filters });
        else writes.push({ table, op: st.op, payload: st.payload, filters: st.filters });
        return Promise.resolve({ data: null, error: erros[`${table}:${st.op}`] ?? null }).then(res);
      },
    };
    return b;
  };
  return { client: { from }, writes, reads };
}

const dados = () => ({
  form_submissions: [
    { id: SUB, organization_id: ORG, form_id: FORM, entity_id: ENT, field_values: { nome: 'Ana', _meta: { a: 1 } } },
  ],
  anew_entities: [
    { id: ENT, organization_id: ORG, deleted_at: null, assigned_to: 'user-owner', created_by: 'user-c', client_since: null },
  ],
});

describe('resolverPessoa', () => {
  it('erro a ler a submissao: 503 RETRY (nunca 404) e regista', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const s = makeSupabase(dados(), { 'form_submissions:select': { message: 'timeout' } });
    const r = await resolverPessoa({ supabase: s.client, organizationId: ORG, formId: FORM, submissionId: SUB });
    expect(r).toEqual({ ok: false, status: 503, error: 'RETRY' });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('erro a ler a entidade: 503 RETRY (nunca 404) e regista', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const s = makeSupabase(dados(), { 'anew_entities:select': { message: 'timeout' } });
    const r = await resolverPessoa({ supabase: s.client, organizationId: ORG, formId: FORM, submissionId: SUB });
    expect(r).toEqual({ ok: false, status: 503, error: 'RETRY' });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('submissao de entidade (sem lead nenhuma) devolve a entidade e o dono', async () => {
    const s = makeSupabase(dados());
    const r = await resolverPessoa({ supabase: s.client, organizationId: ORG, formId: FORM, submissionId: SUB });
    expect(r).toMatchObject({ ok: true, entityId: ENT, ownerAnewUserId: 'user-owner', isClient: false });
    expect(s.reads.map((x) => x.table).sort()).toEqual(['anew_entities', 'form_submissions']);
  });

  it('todas as consultas levam organizacao; a da submissao tambem leva o formulario', async () => {
    const s = makeSupabase(dados());
    await resolverPessoa({ supabase: s.client, organizationId: ORG, formId: FORM, submissionId: SUB });
    const sub = s.reads.find((r) => r.table === 'form_submissions')!;
    expect(sub.filters).toEqual(expect.arrayContaining([['id', SUB], ['organization_id', ORG], ['form_id', FORM]]));
    const ent = s.reads.find((r) => r.table === 'anew_entities')!;
    expect(ent.filters).toEqual(expect.arrayContaining([['id', ENT], ['organization_id', ORG]]));
  });

  it('submissao de outra organizacao recusa com 404', async () => {
    const s = makeSupabase(dados());
    const r = await resolverPessoa({ supabase: s.client, organizationId: OTHER_ORG, formId: FORM, submissionId: SUB });
    expect(r).toMatchObject({ ok: false, status: 404 });
  });

  it('submissao de outro formulario recusa com 404', async () => {
    const s = makeSupabase(dados());
    const r = await resolverPessoa({ supabase: s.client, organizationId: ORG, formId: OTHER_FORM, submissionId: SUB });
    expect(r).toMatchObject({ ok: false, status: 404 });
  });

  it('entidade apagada ou inexistente recusa com 404', async () => {
    const d = dados();
    d.anew_entities[0].deleted_at = '2026-01-01' as any;
    const r = await resolverPessoa({ supabase: makeSupabase(d).client, organizationId: ORG, formId: FORM, submissionId: SUB });
    expect(r).toMatchObject({ ok: false, status: 404 });
  });

  it('entidade com client_since e cliente', async () => {
    const d = dados();
    d.anew_entities[0].client_since = '2025-05-05' as any;
    const r = await resolverPessoa({ supabase: makeSupabase(d).client, organizationId: ORG, formId: FORM, submissionId: SUB });
    expect(r).toMatchObject({ ok: true, isClient: true });
  });

  it('nunca le anew_leads nem anew_clients', async () => {
    const s = makeSupabase(dados());
    await resolverPessoa({ supabase: s.client, organizationId: ORG, formId: FORM, submissionId: SUB });
    const t = s.reads.map((r) => r.table);
    expect(t).not.toContain('anew_leads');
    expect(t).not.toContain('anew_clients');
  });
});

describe('donoDaEntidade', () => {
  it('entidade com assigned_to mantem o dono', () => {
    expect(donoDaEntidade({ assigned_to: 'a', created_by: 'b' })).toBe('a');
  });
  it('sem assigned_to cai para created_by; sem nenhum e null', () => {
    expect(donoDaEntidade({ assigned_to: null, created_by: 'b' })).toBe('b');
    expect(donoDaEntidade({ assigned_to: null, created_by: null })).toBeNull();
    expect(donoDaEntidade(null)).toBeNull();
  });
});

describe('tipoParaEmail', () => {
  it('cliente ou lead pelo client_since', () => {
    expect(tipoParaEmail(true)).toBe('clients');
    expect(tipoParaEmail(false)).toBe('leads');
  });
});

describe('montarItemAgenda', () => {
  const item = montarItemAgenda({
    boardId: 'board', title: 'Visita - Ana', entityId: ENT, submissionId: SUB, formId: FORM,
    slotStart: '2026-11-01T10:00:00Z', slotEnd: '2026-11-01T11:00:00Z', location: 'Rua A',
    postalCode: '4000-123', organizationId: ORG, createdBy: 'user-c',
  });
  it('grava entity_id e nunca lead_id nem client_id', () => {
    expect(item).toMatchObject({ entity_id: ENT, board_id: 'board', organization_id: ORG, created_by: 'user-c' });
    expect(item).not.toHaveProperty('lead_id');
    expect(item).not.toHaveProperty('client_id');
  });
  it('metadata e descricao referem entity_id e submission_id', () => {
    expect(item.metadata).toMatchObject({ entity_id: ENT, submission_id: SUB, form_id: FORM, booked_via: 'public_form' });
    expect(item.metadata).not.toHaveProperty('lead_id');
    expect(item.description).toContain(ENT);
    expect(item.description).toContain(SUB);
  });
});

describe('marcarVisitaNaEntidade', () => {
  const args = (s: ReturnType<typeof makeSupabase>, over: Record<string, unknown> = {}) => ({
    supabase: s.client, organizationId: ORG, entityId: ENT, submissionId: SUB, scheduleItemId: ITEM,
    assignToAnewUserId: 'user-visit', slotStart: '2026-11-01T10:00:00Z', slotEnd: '2026-11-01T11:00:00Z',
    boardId: 'board', mergedFieldValues: { nome: 'Ana', phone: '912345678', _meta: { x: 1 } }, ...over,
  });

  it('so toca em entidade, submissao, convites e emails; nunca em anew_leads nem anew_clients', async () => {
    const s = makeSupabase(dados());
    await marcarVisitaNaEntidade(args(s));
    const tables = new Set(s.writes.map((w) => w.table));
    expect([...tables].sort()).toEqual(['anew_entities', 'form_submissions', 'scheduled_emails', 'scheduling_invites']);
  });

  it('atribui o dono SO quando esta livre (filtro assigned_to is null) e com id e organizacao', async () => {
    const s = makeSupabase(dados());
    await marcarVisitaNaEntidade(args(s));
    const dono = s.writes.find((w) => w.table === 'anew_entities' && 'assigned_to' in w.payload)!;
    expect(dono.payload).toEqual({ assigned_to: 'user-visit' });
    expect(dono.filters).toEqual(expect.arrayContaining([['id', ENT], ['organization_id', ORG], ['assigned_to is', null]]));
  });

  it('sem utilizador a atribuir nao escreve assigned_to', async () => {
    const s = makeSupabase(dados());
    await marcarVisitaNaEntidade(args(s, { assignToAnewUserId: null }));
    expect(s.writes.some((w) => w.table === 'anew_entities' && 'assigned_to' in w.payload)).toBe(false);
  });

  it('carimba last_activity_at com id e organizacao', async () => {
    const s = makeSupabase(dados());
    await marcarVisitaNaEntidade(args(s));
    const stamp = s.writes.find((w) => w.table === 'anew_entities' && 'last_activity_at' in w.payload)!;
    expect(stamp.filters).toEqual(expect.arrayContaining([['id', ENT], ['organization_id', ORG]]));
  });

  it('a submissao fica sem marcacao manual pendente e com a visita no _meta; _meta do cliente nunca entra', async () => {
    const s = makeSupabase(dados());
    await marcarVisitaNaEntidade(args(s, { mergedFieldValues: { nome: 'Ana', _meta: { entidade_nova: true } } }));
    const up = s.writes.find((w) => w.table === 'form_submissions')!;
    expect(up.payload.needs_manual_scheduling).toBe(false);
    expect(up.payload.field_values._meta.visita).toMatchObject({ schedule_item_id: ITEM, board_id: 'board' });
    // o _meta existente na base (a: 1) e preservado; o enviado pelo pedido nao
    expect(up.payload.field_values._meta.a).toBe(1);
    expect(up.payload.field_values._meta.entidade_nova).toBeUndefined();
    expect(up.filters).toEqual(expect.arrayContaining([['id', SUB], ['organization_id', ORG]]));
  });

  it('queima convites e cancela emails pela entidade, com organizacao', async () => {
    const s = makeSupabase(dados());
    await marcarVisitaNaEntidade(args(s));
    const inv = s.writes.find((w) => w.table === 'scheduling_invites')!;
    expect(inv.filters).toEqual(expect.arrayContaining([['entity_id', ENT], ['organization_id', ORG], ['used_at is', null]]));
    const mail = s.writes.find((w) => w.table === 'scheduled_emails')!;
    expect(mail.payload).toEqual({ status: 'cancelled' });
    expect(mail.filters).toEqual(expect.arrayContaining([
      ['entity_type', 'lead_scheduling_invite'], ['entity_id', ENT], ['organization_id', ORG], ['status', 'pending'],
    ]));
  });
});

describe('pedirMarcacaoManual', () => {
  it('guarda a hora pedida e marca a submissao como por agendar, sem tocar em anew_leads', async () => {
    const s = makeSupabase(dados());
    const r = await pedirMarcacaoManual({
      supabase: s.client, organizationId: ORG, submissionId: SUB, boardId: 'board', formId: FORM,
      slotStart: 's', slotEnd: 'e', districtId: null,
    });
    const up = s.writes.find((w) => w.table === 'form_submissions')!;
    expect(up.payload.needs_manual_scheduling).toBe(true);
    expect(up.payload.field_values._meta.agendamento_pedido).toMatchObject({ inicio: 's', fim: 'e', board_id: 'board' });
    expect(up.filters).toEqual(expect.arrayContaining([['id', SUB], ['organization_id', ORG]]));
    expect(s.writes.map((w) => w.table)).not.toContain('anew_leads');
    expect(r).toEqual({ ok: true });
  });

  const pedido = (s: ReturnType<typeof makeSupabase>) => ({
    supabase: s.client, organizationId: ORG, submissionId: SUB, boardId: 'board', formId: FORM,
    slotStart: 's', slotEnd: 'e', districtId: null,
  });

  it('leitura da submissao falhada: nao escreve (nao apaga field_values) e devolve a falha', async () => {
    const s = makeSupabase(dados(), { 'form_submissions:select': { message: 'boom' } });
    const r = await pedirMarcacaoManual(pedido(s));
    expect(r.ok).toBe(false);
    expect(s.writes).toHaveLength(0);
  });

  it('submissao inexistente: nao escreve e devolve a falha', async () => {
    const d = dados();
    d.form_submissions = [];
    const s = makeSupabase(d);
    const r = await pedirMarcacaoManual(pedido(s));
    expect(r.ok).toBe(false);
    expect(s.writes).toHaveLength(0);
  });

  it('escrita falhada (supabase-js nao lanca): devolve a falha em vez de a engolir', async () => {
    const s = makeSupabase(dados(), { 'form_submissions:update': { message: 'boom' } });
    const r = await pedirMarcacaoManual(pedido(s));
    expect(r.ok).toBe(false);
  });
});

describe('marcarVisitaNaEntidade: falhas', () => {
  const args = (s: ReturnType<typeof makeSupabase>) => ({
    supabase: s.client, organizationId: ORG, entityId: ENT, submissionId: SUB, scheduleItemId: ITEM,
    assignToAnewUserId: 'user-visit', slotStart: '2026-11-01T10:00:00Z', slotEnd: '2026-11-01T11:00:00Z',
    boardId: 'board', mergedFieldValues: { nome: 'Ana' },
  });

  it('sem falhas devolve lista vazia', async () => {
    expect(await marcarVisitaNaEntidade(args(makeSupabase(dados())))).toEqual([]);
  });

  it('leitura da submissao falhada: nao reescreve a submissao (nao perde o _meta) e o resto continua', async () => {
    const s = makeSupabase(dados(), { 'form_submissions:select': { message: 'boom' } });
    const falhas = await marcarVisitaNaEntidade(args(s));
    expect(s.writes.some((w) => w.table === 'form_submissions')).toBe(false);
    expect(falhas).toEqual(['actualizar submissao']);
    expect(s.writes.some((w) => w.table === 'scheduling_invites')).toBe(true);
  });

  it('escrita falhada num passo: aparece na lista devolvida', async () => {
    const s = makeSupabase(dados(), { 'scheduling_invites:update': { message: 'boom' } });
    expect(await marcarVisitaNaEntidade(args(s))).toEqual(['queimar convites']);
  });
});

describe('lerDefinicoesDoFormulario (campos de contacto lidos ANTES de criar a entidade)', () => {
  const campos = () => ({
    form_fields: [
      { form_id: FORM, is_active: true, field_key: 'k_mail', contact_field_mapping: 'email' },
      { form_id: FORM, is_active: false, field_key: 'k_off', contact_field_mapping: 'phone' },
      { form_id: OTHER_FORM, is_active: true, field_key: 'k_outro', contact_field_mapping: 'phone' },
    ],
  });

  it('devolve so os campos activos do formulario', async () => {
    const s = makeSharedSupabase(campos());
    const r = await lerDefinicoesDoFormulario(s.client, FORM);
    expect(r).toEqual({
      ok: true,
      definitions: [{ form_id: FORM, is_active: true, field_key: 'k_mail', contact_field_mapping: 'email' }],
    });
  });

  it('erro de leitura NAO devolve lista vazia: devolve ok:false (o handler responde 503 RETRY antes de escrever)', async () => {
    const s = makeSharedSupabase(campos(), { 'form_fields:select': { message: 'boom' } });
    const r = await lerDefinicoesDoFormulario(s.client, FORM);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('boom');
  });

  it('formulario sem campos devolve lista vazia com ok:true', async () => {
    const r = await lerDefinicoesDoFormulario(makeSharedSupabase({ form_fields: [] }).client, FORM);
    expect(r).toEqual({ ok: true, definitions: [] });
  });
});
