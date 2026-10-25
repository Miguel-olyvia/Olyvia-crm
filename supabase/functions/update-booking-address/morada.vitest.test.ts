// update-booking-address: a morada que a pessoa corrige na pagina de gerir a
// visita grava-se na SUBMISSAO da visita (a que o get-booking le), ligada a
// visita por metadata.submission_id e a entidade por entity_id. Nao ha lead.
import { describe, expect, it } from 'vitest';
import { guardarMoradaDaVisita } from './morada.ts';
import { makeSupabase } from '../_shared/__tests__/supabaseSimulado.ts';

const ORG = 'aaaaaaaa-0000-4000-8000-000000000001';
const ENT = 'eeeeeeee-0000-4000-8000-000000000005';
const SUB = '99999999-0000-4000-8000-000000000007';

const item = (over: Record<string, unknown> = {}) => ({
  id: 'it1', organization_id: ORG, entity_id: ENT, metadata: { entity_id: ENT, submission_id: SUB }, ...over,
});
const dados = () => ({
  form_submissions: [
    {
      id: SUB, organization_id: ORG,
      field_values: { nome: 'Ana', address: 'Rua Velha 1', postal_code: '1000-001', _meta: { visita: { schedule_item_id: 'it1' } } },
    },
  ],
});
const nova = { morada: 'Rua Nova 2', codigo_postal: '2000-002', localidade: 'Santarem' };

describe('guardarMoradaDaVisita', () => {
  it('troca so as chaves de morada (as que ja existem, senao as canonicas) e preserva o resto', async () => {
    const s = makeSupabase(dados());
    const r = await guardarMoradaDaVisita(s.client, item(), nova);
    expect(r).toEqual({ ok: true });
    expect(s.writes).toHaveLength(1);
    const w = s.writes[0];
    expect(w.table).toBe('form_submissions');
    expect(w.filters).toEqual(expect.arrayContaining([['id', SUB], ['organization_id', ORG]]));
    expect(w.payload.field_values).toEqual({
      nome: 'Ana',
      address: 'Rua Nova 2',
      postal_code: '2000-002',
      localidade: 'Santarem',
      _meta: { visita: { schedule_item_id: 'it1' } },
    });
  });

  it('nunca le nem escreve anew_leads, anew_clients ou anew_entities', async () => {
    const s = makeSupabase(dados());
    await guardarMoradaDaVisita(s.client, item(), nova);
    const tabelas = [...s.reads.map((x) => x.table), ...s.writes.map((x) => x.table)];
    expect(tabelas.every((t) => t === 'form_submissions')).toBe(true);
  });

  it('item sem submission_id (nem metadata.lead_id serve): INVALID e nada escrito', async () => {
    const s = makeSupabase(dados());
    const r = await guardarMoradaDaVisita(s.client, item({ metadata: { lead_id: 'L' } }), nova);
    expect(r).toMatchObject({ ok: false, code: 'INVALID' });
    expect(s.reads).toHaveLength(0);
    expect(s.writes).toHaveLength(0);
  });

  it('submissao inexistente ou de outra organizacao: INVALID', async () => {
    const r = await guardarMoradaDaVisita(makeSupabase(dados()).client, item({ organization_id: 'bbbbbbbb-0000-4000-8000-000000000002' }), nova);
    expect(r).toMatchObject({ ok: false, code: 'INVALID' });
  });

  it('erro a ler ou a escrever: RETRY (503), nunca sucesso', async () => {
    const le = makeSupabase(dados(), { 'form_submissions:select': { message: 'boom' } });
    expect(await guardarMoradaDaVisita(le.client, item(), nova)).toMatchObject({ ok: false, code: 'RETRY' });
    expect(le.writes).toHaveLength(0);
    const escreve = makeSupabase(dados(), { 'form_submissions:update': { message: 'boom2' } });
    const r = await guardarMoradaDaVisita(escreve.client, item(), nova);
    expect(r).toMatchObject({ ok: false, code: 'RETRY' });
    if (!r.ok) expect(r.error).not.toContain('boom');
  });
});
