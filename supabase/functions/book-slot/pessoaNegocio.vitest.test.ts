// book-slot: o negocio da visita, lido no SERVIDOR (nunca do corpo do pedido).
// Supabase simulado; nada toca na base.
import { describe, expect, it } from 'vitest';
import { makeSupabase } from '../_shared/__tests__/supabaseSimulado.ts';
import { marcarVisitaNaEntidade, montarItemAgenda, resolverPessoa } from './pessoa.ts';

const ORG = 'aaaaaaaa-0000-4000-8000-000000000001';
const OTHER_ORG = 'bbbbbbbb-0000-4000-8000-000000000002';
const FORM = 'ffffffff-0000-4000-8000-000000000003';
const ENT = 'eeeeeeee-0000-4000-8000-000000000005';
const OTHER_ENT = 'eeeeeeee-0000-4000-8000-0000000000ff';
const SUB = '99999999-0000-4000-8000-000000000007';
const ITEM = '11111111-0000-4000-8000-000000000008';
const NEG = 'dddddddd-0000-4000-8000-0000000000bb';

const dados = (neg: Record<string, unknown> = {}) => ({
  form_submissions: [
    { id: SUB, organization_id: ORG, form_id: FORM, entity_id: ENT, negocio_id: NEG, field_values: { nome: 'Ana' } },
  ],
  anew_entities: [
    { id: ENT, organization_id: ORG, deleted_at: null, assigned_to: null, created_by: 'user-c', client_since: null },
  ],
  negocios: [
    { id: NEG, organization_id: ORG, entity_id: ENT, estado: 'aberto', deleted_at: null, assigned_to: null, ...neg },
  ],
});

const resolver = (d: ReturnType<typeof dados>, org = ORG) =>
  resolverPessoa({ supabase: makeSupabase(d).client, organizationId: org, formId: FORM, submissionId: SUB });

describe('resolverPessoa: negocio_id', () => {
  it('le o negocio da submissao e confirma-o em negocios (mesma org e entidade, aberto, vivo)', async () => {
    const s = makeSupabase(dados());
    const r = await resolverPessoa({ supabase: s.client, organizationId: ORG, formId: FORM, submissionId: SUB });
    expect(r).toMatchObject({ ok: true, entityId: ENT, negocioId: NEG });
    const q = s.reads.find((x) => x.table === 'negocios')!;
    expect(q.filters).toEqual(expect.arrayContaining([
      ['id', NEG], ['organization_id', ORG], ['entity_id', ENT], ['estado', 'aberto'], ['deleted_at is', null],
    ]));
  });
  it('submissao sem negocio (pessoa conhecida na fila): negocioId null e nao consulta negocios', async () => {
    const d = dados();
    d.form_submissions[0].negocio_id = null as any;
    const s = makeSupabase(d);
    const r = await resolverPessoa({ supabase: s.client, organizationId: ORG, formId: FORM, submissionId: SUB });
    expect(r).toMatchObject({ ok: true, negocioId: null });
    expect(s.reads.map((x) => x.table)).not.toContain('negocios');
  });
  it('negocio de outra entidade: negocioId null (a pessoa continua resolvida)', async () => {
    expect(await resolver(dados({ entity_id: OTHER_ENT }))).toMatchObject({ ok: true, negocioId: null });
  });
  it('negocio de outra organizacao: negocioId null', async () => {
    expect(await resolver(dados({ organization_id: OTHER_ORG }))).toMatchObject({ ok: true, negocioId: null });
  });
  it('negocio fechado ou apagado: negocioId null', async () => {
    expect(await resolver(dados({ estado: 'ganho' }))).toMatchObject({ ok: true, negocioId: null });
    expect(await resolver(dados({ deleted_at: '2026-01-01' }))).toMatchObject({ ok: true, negocioId: null });
  });
  it('erro a ler negocios: negocioId null, nunca um id por confirmar', async () => {
    const s = makeSupabase(dados(), { 'negocios:select': { message: 'boom' } });
    const r = await resolverPessoa({ supabase: s.client, organizationId: ORG, formId: FORM, submissionId: SUB });
    expect(r).toMatchObject({ ok: true, negocioId: null });
  });
  it('a pessoa e recusada (404) antes de se olhar para o negocio', async () => {
    const s = makeSupabase(dados());
    const r = await resolverPessoa({ supabase: s.client, organizationId: OTHER_ORG, formId: FORM, submissionId: SUB });
    expect(r).toMatchObject({ ok: false, status: 404 });
    expect(s.reads.map((x) => x.table)).not.toContain('negocios');
  });
});

describe('montarItemAgenda: negocio_id', () => {
  const base = {
    boardId: 'board', title: 'Visita - Ana', entityId: ENT, submissionId: SUB, formId: FORM,
    slotStart: '2026-11-01T10:00:00Z', slotEnd: '2026-11-01T11:00:00Z', location: 'Rua A',
    postalCode: '4000-123', organizationId: ORG, createdBy: 'user-c',
  };
  it('leva negocio_id quando ha negocio confirmado', () => {
    expect(montarItemAgenda({ ...base, negocioId: NEG })).toMatchObject({ entity_id: ENT, negocio_id: NEG });
  });
  it('sem negocio nao escreve a chave', () => {
    expect(montarItemAgenda({ ...base, negocioId: null })).not.toHaveProperty('negocio_id');
    expect(montarItemAgenda(base)).not.toHaveProperty('negocio_id');
  });
});

describe('marcarVisitaNaEntidade: dono do negocio', () => {
  const args = (s: ReturnType<typeof makeSupabase>, over: Record<string, unknown> = {}) => ({
    supabase: s.client, organizationId: ORG, entityId: ENT, submissionId: SUB, scheduleItemId: ITEM,
    assignToAnewUserId: 'user-visit', slotStart: '2026-11-01T10:00:00Z', slotEnd: '2026-11-01T11:00:00Z',
    boardId: 'board', mergedFieldValues: { nome: 'Ana' }, negocioId: NEG, ...over,
  });

  it('atribui negocios.assigned_to so onde e nulo, com id, organizacao, entidade, aberto e vivo', async () => {
    const s = makeSupabase(dados());
    await marcarVisitaNaEntidade(args(s));
    const w = s.writes.find((x) => x.table === 'negocios')!;
    expect(w.op).toBe('update');
    expect(w.payload).toEqual({ assigned_to: 'user-visit' });
    expect(w.filters).toEqual(expect.arrayContaining([
      ['id', NEG], ['organization_id', ORG], ['entity_id', ENT], ['estado', 'aberto'],
      ['assigned_to is', null], ['deleted_at is', null],
    ]));
  });
  it('sem utilizador a atribuir ou sem negocio, nao escreve em negocios', async () => {
    const a = makeSupabase(dados());
    await marcarVisitaNaEntidade(args(a, { assignToAnewUserId: null }));
    expect(a.writes.map((x) => x.table)).not.toContain('negocios');
    const b = makeSupabase(dados());
    await marcarVisitaNaEntidade(args(b, { negocioId: null }));
    expect(b.writes.map((x) => x.table)).not.toContain('negocios');
  });
  it('a entidade continua a receber dono so se livre (comportamento anterior intacto)', async () => {
    const s = makeSupabase(dados());
    await marcarVisitaNaEntidade(args(s));
    const dono = s.writes.find((x) => x.table === 'anew_entities' && 'assigned_to' in x.payload)!;
    expect(dono.filters).toEqual(expect.arrayContaining([['assigned_to is', null]]));
  });
  it('falha a atribuir o negocio aparece na lista e nao impede os outros passos', async () => {
    const s = makeSupabase(dados(), { 'negocios:update': { message: 'boom' } });
    const falhas = await marcarVisitaNaEntidade(args(s));
    expect(falhas).toEqual(['atribuir dono do negocio']);
    expect(s.writes.some((x) => x.table === 'scheduling_invites')).toBe(true);
  });
});
