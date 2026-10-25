// auto-schedule: a visita liga-se a ENTIDADE (schedule_items.entity_id). As
// colunas lead_id e client_id ja nao existem em schedule_items, e o criador de
// uma chamada maquina (sem JWT) herda-se da entidade, nao de uma anew_leads.
import { describe, expect, it } from 'vitest';
import { criadorDaEntidade, ligacaoDaVisita } from './entidade.ts';
import { makeSupabase } from '../_shared/__tests__/supabaseSimulado.ts';

const ORG = 'aaaaaaaa-0000-4000-8000-000000000001';
const ENT = 'eeeeeeee-0000-4000-8000-000000000005';

const dados = () => ({
  anew_entities: [
    { id: ENT, organization_id: ORG, created_by: 'user-c', deleted_at: null },
  ] as Record<string, any>[],
});

describe('criadorDaEntidade', () => {
  it('devolve o created_by da entidade, lida com organizacao e so se nao apagada', async () => {
    const s = makeSupabase(dados());
    expect(await criadorDaEntidade(s.client, ENT, ORG)).toEqual({ ok: true, userId: 'user-c' });
    const r = s.reads[0];
    expect(r.table).toBe('anew_entities');
    expect(r.filters).toEqual(expect.arrayContaining([['id', ENT], ['organization_id', ORG], ['deleted_at is', null]]));
  });

  it('entidade de outra organizacao ou apagada: sem criador (ok, userId null)', async () => {
    expect(await criadorDaEntidade(makeSupabase(dados()).client, ENT, 'bbbbbbbb-0000-4000-8000-000000000002'))
      .toEqual({ ok: true, userId: null });
    const d = dados();
    d.anew_entities[0].deleted_at = '2026-01-01';
    expect(await criadorDaEntidade(makeSupabase(d).client, ENT, ORG)).toEqual({ ok: true, userId: null });
  });

  it('erro de leitura: ok:false (nao se confunde com "sem criador")', async () => {
    const s = makeSupabase(dados(), { 'anew_entities:select': { message: 'boom' } });
    const r = await criadorDaEntidade(s.client, ENT, ORG);
    expect(r.ok).toBe(false);
  });

  it('nunca le anew_leads', async () => {
    const s = makeSupabase(dados());
    await criadorDaEntidade(s.client, ENT, ORG);
    expect(s.reads.map((x) => x.table)).not.toContain('anew_leads');
  });
});

describe('ligacaoDaVisita', () => {
  it('so entity_id, contact_id e deal_id: sem lead_id nem client_id', () => {
    const l = ligacaoDaVisita({ entity_id: ENT, contact_id: 'c1', deal_id: 'd1', lead_id: 'L', client_id: 'C' } as any);
    expect(l).toEqual({ entity_id: ENT, contact_id: 'c1', deal_id: 'd1' });
    expect(l).not.toHaveProperty('lead_id');
    expect(l).not.toHaveProperty('client_id');
  });

  it('o que nao vem fica nulo (nunca a chave antiga)', () => {
    expect(ligacaoDaVisita({})).toEqual({ entity_id: null, contact_id: null, deal_id: null });
  });
});
