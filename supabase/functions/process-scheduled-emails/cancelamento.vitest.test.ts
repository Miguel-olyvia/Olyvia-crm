// process-scheduled-emails: quando um email agendado deve ser cancelado antes
// do envio. Os lembretes de visita do formulario trazem entity_type
// 'leads'/'clients' com o id da ENTIDADE (nao o de uma anew_leads).
import { describe, expect, it } from 'vitest';
import { checkIfShouldCancel } from './cancelamento.ts';
import { makeSupabase } from '../_shared/__tests__/supabaseSimulado.ts';

const ORG = 'aaaaaaaa-0000-4000-8000-000000000001';
const ENT = 'eeeeeeee-0000-4000-8000-000000000005';
const LEAD = 'dddddddd-0000-4000-8000-0000000000dd';
const TPL = 'tttttttt-0000-4000-8000-0000000000aa';

const email = (over: Record<string, unknown> = {}) => ({
  id: 'm1', template_id: TPL, entity_type: 'leads', entity_id: ENT, organization_id: ORG, ...over,
});
const dados = () => ({
  email_templates: [{ id: TPL, trigger_phase: 'Visita', module: 'leads' }] as Record<string, any>[],
  // Tabelas antigas presentes so para provar que ja nao se leem.
  anew_leads: [{ id: LEAD, workflow_stage_id: 'st1' }] as Record<string, any>[],
  lead_workflow_stages: [{ id: 'st1', name: 'Outra fase' }] as Record<string, any>[],
  anew_entities: [{ id: ENT, organization_id: ORG, deleted_at: null }] as Record<string, any>[],
});

describe('checkIfShouldCancel', () => {
  it('lembrete de entidade viva (sem anew_leads) NAO e cancelado', async () => {
    const s = makeSupabase(dados());
    expect(await checkIfShouldCancel(s.client, email())).toBe(false);
  });

  it('a entidade e lida com o filtro da organizacao do email', async () => {
    const s = makeSupabase(dados());
    await checkIfShouldCancel(s.client, email());
    const r = s.reads.find((x) => x.table === 'anew_entities')!;
    expect(r.filters).toEqual(expect.arrayContaining([['id', ENT], ['organization_id', ORG]]));
  });

  it('entidade de outra organizacao ou apagada: cancela', async () => {
    expect(await checkIfShouldCancel(makeSupabase(dados()).client, email({ organization_id: 'bbbbbbbb-0000-4000-8000-000000000002' }))).toBe(true);
    const d = dados();
    d.anew_entities[0].deleted_at = '2026-01-01';
    expect(await checkIfShouldCancel(makeSupabase(d).client, email())).toBe(true);
  });

  it('nem lead nem entidade: cancela', async () => {
    const d = dados();
    d.anew_entities = [];
    expect(await checkIfShouldCancel(makeSupabase(d).client, email())).toBe(true);
  });

  it('o ramo leads so procura a ENTIDADE: nunca le anew_leads nem lead_workflow_stages', async () => {
    const s = makeSupabase(dados());
    await checkIfShouldCancel(s.client, email());
    const tabelas = s.reads.map((r) => r.table);
    expect(tabelas).toContain('anew_entities');
    expect(tabelas).not.toContain('anew_leads');
    expect(tabelas).not.toContain('lead_workflow_stages');
  });

  it('um id de anew_leads ja nao e caminho: sem entidade com esse id, cancela', async () => {
    expect(await checkIfShouldCancel(makeSupabase(dados()).client, email({ entity_id: LEAD }))).toBe(true);
  });

  it("'clients' continua a nao cancelar", async () => {
    expect(await checkIfShouldCancel(makeSupabase(dados()).client, email({ entity_type: 'clients' }))).toBe(false);
  });

  it('template sem trigger_phase nunca cancela e nao le leads nem entidades', async () => {
    const d = dados();
    d.email_templates = [{ id: TPL, trigger_phase: null, module: 'leads' }];
    const s = makeSupabase(d);
    expect(await checkIfShouldCancel(s.client, email())).toBe(false);
    expect(s.reads.map((r) => r.table)).toEqual(['email_templates']);
  });

  it('leitura falhada nao cancela em silencio: lanca para o email ficar como falhado', async () => {
    const s = makeSupabase(dados(), { 'anew_entities:select': { message: 'boom2' } });
    await expect(checkIfShouldCancel(s.client, email())).rejects.toThrow(/boom2/);
  });
});
