// Pessoa por tras de uma visita (schedule_items) para cancel-booking,
// reschedule-booking e get-booking: so pela ENTIDADE e pela submissao.
// Nao ha caminho antigo (metadata.lead_id / anew_leads).
import { describe, expect, it } from 'vitest';
import {
  atualizarVisitaDaSubmissao,
  cancelarLembretesDaPessoa,
  resolverPessoaDoItem,
  tipoLembrete,
} from './bookingItem.ts';
import { makeSupabase } from './__tests__/supabaseSimulado.ts';

const ORG = 'aaaaaaaa-0000-4000-8000-000000000001';
const ENT = 'eeeeeeee-0000-4000-8000-000000000005';
const SUB = '99999999-0000-4000-8000-000000000007';

const dados = () => ({
  anew_entities: [
    { id: ENT, organization_id: ORG, display_name: 'Ana Silva', assigned_to: 'user-owner', created_by: 'user-c', client_since: null },
  ],
  form_submissions: [
    { id: SUB, organization_id: ORG, field_values: { nome: 'Ana', email: 'ana@x.pt' } },
  ],
});

describe('resolverPessoaDoItem', () => {
  it('item (entity_id + submission_id): entidade, dados da submissao e dono; nunca le anew_leads', async () => {
    const s = makeSupabase(dados());
    const p = await resolverPessoaDoItem(s.client, {
      organization_id: ORG, entity_id: ENT, metadata: { entity_id: ENT, submission_id: SUB },
    });
    expect(p).toMatchObject({ entityId: ENT, displayName: 'Ana Silva', ownerId: 'user-owner', isClient: false, erro: null });
    expect(p).not.toHaveProperty('legacyLeadId');
    expect(p.fieldValues).toMatchObject({ nome: 'Ana', email: 'ana@x.pt' });
    expect(s.reads.map((r) => r.table)).not.toContain('anew_leads');
    const ent = s.reads.find((r) => r.table === 'anew_entities')!;
    expect(ent.filters).toEqual(expect.arrayContaining([['id', ENT], ['organization_id', ORG]]));
    const sub = s.reads.find((r) => r.table === 'form_submissions')!;
    expect(sub.filters).toEqual(expect.arrayContaining([['id', SUB], ['organization_id', ORG]]));
  });

  it('usa metadata.entity_id quando a coluna vem vazia; cliente pelo client_since', async () => {
    const d = dados();
    (d.anew_entities[0] as any).client_since = '2025-05-05';
    const p = await resolverPessoaDoItem(makeSupabase(d).client, { organization_id: ORG, entity_id: null, metadata: { entity_id: ENT } });
    expect(p).toMatchObject({ entityId: ENT, isClient: true });
  });

  it('metadata.lead_id e ignorado: nao ha caminho antigo', async () => {
    const s = makeSupabase({ ...dados(), anew_leads: [{ id: 'L', field_values: { nome: 'Velho' } }] });
    const p = await resolverPessoaDoItem(s.client, { organization_id: ORG, metadata: { lead_id: 'L' } });
    expect(p).toMatchObject({ entityId: null, fieldValues: {}, ownerId: null, erro: null });
    expect(s.reads).toHaveLength(0);
  });

  it('entidade de outra organizacao nao e lida (devolve vazio)', async () => {
    const p = await resolverPessoaDoItem(makeSupabase(dados()).client, {
      organization_id: 'bbbbbbbb-0000-4000-8000-000000000002', entity_id: ENT, metadata: { submission_id: SUB },
    });
    expect(p.displayName).toBe('');
    expect(p.fieldValues).toEqual({});
    expect(p.entityId).toBe(ENT);
  });

  it('erro a ler a entidade devolve o erro e nao uma pessoa vazia a fingir', async () => {
    const s = makeSupabase(dados(), { 'anew_entities:select': { message: 'boom' } });
    const p = await resolverPessoaDoItem(s.client, { organization_id: ORG, entity_id: ENT, metadata: { submission_id: SUB } });
    expect(p.erro).toContain('boom');
  });

  it('erro a ler a submissao devolve o erro', async () => {
    const s = makeSupabase(dados(), { 'form_submissions:select': { message: 'boom2' } });
    const p = await resolverPessoaDoItem(s.client, { organization_id: ORG, entity_id: ENT, metadata: { submission_id: SUB } });
    expect(p.erro).toContain('boom2');
  });
});

describe('cancelarLembretesDaPessoa', () => {
  it('cancela pendentes de leads e clients da entidade, na organizacao, e so esses tipos', async () => {
    const s = makeSupabase(dados());
    const falhas = await cancelarLembretesDaPessoa(s.client, { organizationId: ORG, entityId: ENT });
    expect(falhas).toEqual([]);
    expect(s.writes).toHaveLength(1);
    const w = s.writes[0];
    expect(w.table).toBe('scheduled_emails');
    expect(w.payload).toEqual({ status: 'cancelled' });
    expect(w.filters).toEqual(expect.arrayContaining([
      ['entity_type in', ['leads', 'clients']], ['entity_id', ENT], ['organization_id', ORG], ['status', 'pending'],
    ]));
  });

  it('sem entidade nao escreve nada', async () => {
    const s = makeSupabase(dados());
    expect(await cancelarLembretesDaPessoa(s.client, { organizationId: ORG, entityId: null })).toEqual([]);
    expect(s.writes).toHaveLength(0);
  });

  it('escrita falhada nao passa em silencio: devolve a falha', async () => {
    const s = makeSupabase(dados(), { 'scheduled_emails:update': { message: 'boom' } });
    const falhas = await cancelarLembretesDaPessoa(s.client, { organizationId: ORG, entityId: ENT });
    expect(falhas).toHaveLength(1);
    expect(falhas[0]).toContain('boom');
  });
});

describe('tipoLembrete', () => {
  it('cliente ou lead pelo client_since', () => {
    expect(tipoLembrete(true)).toBe('clients');
    expect(tipoLembrete(false)).toBe('leads');
  });
});

describe('atualizarVisitaDaSubmissao (o espelho da visita na submissao; substitui anew_leads.status/scheduled_visit_id)', () => {
  const visitaAntiga = { schedule_item_id: 'it1', inicio: '2026-11-01T10:00:00Z', fim: '2026-11-01T11:00:00Z', board_id: 'b1', marcada_em: '2026-10-01T00:00:00Z' };
  const comVisita = () => ({
    form_submissions: [
      { id: SUB, organization_id: ORG, field_values: { nome: 'Ana', _meta: { current_step: 2, visita: visitaAntiga } } },
    ],
  });

  it('cancelada: marca a visita como cancelada, mantem o resto do _meta e dos campos, na organizacao', async () => {
    const s = makeSupabase(comVisita());
    const falhas = await atualizarVisitaDaSubmissao(s.client, {
      organizationId: ORG, submissionId: SUB, alteracao: { tipo: 'cancelada' }, agora: '2026-10-20T09:00:00Z',
    });
    expect(falhas).toEqual([]);
    expect(s.writes).toHaveLength(1);
    const w = s.writes[0];
    expect(w.table).toBe('form_submissions');
    expect(w.filters).toEqual(expect.arrayContaining([['id', SUB], ['organization_id', ORG]]));
    expect(w.payload.field_values.nome).toBe('Ana');
    expect(w.payload.field_values._meta.current_step).toBe(2);
    expect(w.payload.field_values._meta.visita).toMatchObject({
      schedule_item_id: 'it1', estado: 'cancelada', cancelada_em: '2026-10-20T09:00:00Z',
    });
  });

  it('reagendada: troca inicio e fim, volta a marcada e guarda quando foi reagendada', async () => {
    const s = makeSupabase(comVisita());
    const falhas = await atualizarVisitaDaSubmissao(s.client, {
      organizationId: ORG, submissionId: SUB,
      alteracao: { tipo: 'reagendada', inicio: '2026-11-05T14:00:00Z', fim: '2026-11-05T15:00:00Z' },
      agora: '2026-10-20T09:00:00Z',
    });
    expect(falhas).toEqual([]);
    const v = s.writes[0].payload.field_values._meta.visita;
    expect(v).toMatchObject({
      schedule_item_id: 'it1', inicio: '2026-11-05T14:00:00Z', fim: '2026-11-05T15:00:00Z',
      estado: 'marcada', reagendada_em: '2026-10-20T09:00:00Z',
    });
    expect(v).not.toHaveProperty('cancelada_em');
  });

  it('sem submissao nao le nem escreve nada', async () => {
    const s = makeSupabase(comVisita());
    expect(await atualizarVisitaDaSubmissao(s.client, { organizationId: ORG, submissionId: null, alteracao: { tipo: 'cancelada' } })).toEqual([]);
    expect(s.reads).toHaveLength(0);
    expect(s.writes).toHaveLength(0);
  });

  it('leitura falhada ou submissao inexistente: devolve a falha e NAO escreve (nao apaga o _meta)', async () => {
    const s1 = makeSupabase(comVisita(), { 'form_submissions:select': { message: 'boom' } });
    const f1 = await atualizarVisitaDaSubmissao(s1.client, { organizationId: ORG, submissionId: SUB, alteracao: { tipo: 'cancelada' } });
    expect(f1).toHaveLength(1);
    expect(f1[0]).toContain('boom');
    expect(s1.writes).toHaveLength(0);
    const s2 = makeSupabase({ form_submissions: [] });
    const f2 = await atualizarVisitaDaSubmissao(s2.client, { organizationId: ORG, submissionId: SUB, alteracao: { tipo: 'cancelada' } });
    expect(f2).toHaveLength(1);
    expect(s2.writes).toHaveLength(0);
  });

  it('submissao de outra organizacao nao se toca', async () => {
    const s = makeSupabase(comVisita());
    const f = await atualizarVisitaDaSubmissao(s.client, {
      organizationId: 'bbbbbbbb-0000-4000-8000-000000000002', submissionId: SUB, alteracao: { tipo: 'cancelada' },
    });
    expect(f).toHaveLength(1);
    expect(s.writes).toHaveLength(0);
  });

  it('escrita falhada devolve a falha', async () => {
    const s = makeSupabase(comVisita(), { 'form_submissions:update': { message: 'boom3' } });
    const f = await atualizarVisitaDaSubmissao(s.client, { organizationId: ORG, submissionId: SUB, alteracao: { tipo: 'cancelada' } });
    expect(f).toHaveLength(1);
    expect(f[0]).toContain('boom3');
  });
});
