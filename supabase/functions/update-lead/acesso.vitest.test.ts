// update-lead: decisao de acesso a submissao e conclusao da entidade nova.
// Supabase simulado; nada toca na base.
import { describe, expect, it, vi } from 'vitest';
import { completarSeNova, decidirAcesso } from './acesso.ts';

const FORM = 'ffffffff-0000-4000-8000-000000000003';
const OTHER_FORM = 'ffffffff-0000-4000-8000-0000000000aa';
const CAMP = 'cccccccc-0000-4000-8000-000000000004';
const SUB = '99999999-0000-4000-8000-000000000007';

const submissao = (over: Record<string, unknown> = {}) => ({
  id: SUB, form_id: FORM, campaign_id: null as string | null, organization_id: 'org-1',
  field_values: { _meta: { entidade_nova: true } }, ...over,
});

describe('decidirAcesso', () => {
  it('passo 2 sem campaign_id aceita (antes dava 400)', () => {
    expect(decidirAcesso({ submission: submissao(), formId: FORM, campaignId: null })).toEqual({ ok: true, formId: FORM });
  });

  it('form_id diferente do da submissao recusa com 403', () => {
    expect(decidirAcesso({ submission: submissao(), formId: OTHER_FORM, campaignId: null }))
      .toMatchObject({ ok: false, status: 403 });
  });

  it('sem form_id nem campaign_id recusa com 400', () => {
    expect(decidirAcesso({ submission: submissao(), formId: null, campaignId: null }))
      .toMatchObject({ ok: false, status: 400 });
  });

  it('so campaign_id: compara com a campanha da submissao', () => {
    const s = submissao({ campaign_id: CAMP });
    expect(decidirAcesso({ submission: s, formId: null, campaignId: CAMP })).toEqual({ ok: true, formId: FORM });
    expect(decidirAcesso({ submission: s, formId: null, campaignId: 'outra' })).toMatchObject({ ok: false, status: 403 });
  });

  it('submissao sem campanha e pedido com campanha recusa', () => {
    expect(decidirAcesso({ submission: submissao(), formId: null, campaignId: CAMP }))
      .toMatchObject({ ok: false, status: 403 });
  });

  it('mensagens de erro nao trazem ids internos', () => {
    const r = decidirAcesso({ submission: submissao(), formId: OTHER_FORM, campaignId: null });
    expect(JSON.stringify(r)).not.toContain(FORM);
  });
});

describe('completarSeNova', () => {
  const defs = [
    { field_key: 'nome', contact_field_mapping: 'first_name' },
    { field_key: 'apelido', contact_field_mapping: 'last_name' },
    { field_key: 'rua', contact_field_mapping: 'address' },
    { field_key: 'cp', contact_field_mapping: 'postal_code' },
    { field_key: 'loc', contact_field_mapping: 'city' },
  ];
  const mk = (data: any = true) => {
    const rpc = vi.fn(async () => ({ data, error: null }));
    const from = vi.fn(() => { throw new Error('nao devia tocar em tabelas'); });
    return { client: { rpc, from }, rpc, from };
  };

  it('submissao sem a marca nunca chama fn_form_completar_entidade', async () => {
    const s = mk();
    const r = await completarSeNova({
      supabase: s.client, submission: submissao({ field_values: { _meta: {} } }),
      fieldValues: { nome: 'Ana' }, definitions: defs,
    });
    expect(r).toBe(false);
    expect(s.rpc).not.toHaveBeenCalled();
  });

  it('a marca tem de ser exatamente true', async () => {
    const s = mk();
    await completarSeNova({
      supabase: s.client, submission: submissao({ field_values: { _meta: { entidade_nova: 'true' } } }),
      fieldValues: { nome: 'Ana' }, definitions: defs,
    });
    expect(s.rpc).not.toHaveBeenCalled();
  });

  it('com a marca chama a funcao com nome e morada deste passo, e nunca le anew_leads', async () => {
    const s = mk(true);
    const r = await completarSeNova({
      supabase: s.client, submission: submissao(),
      fieldValues: { nome: 'Ana', apelido: 'Silva', rua: 'Rua A 1', cp: '4000-123', loc: 'Porto' },
      definitions: defs,
    });
    expect(r).toBe(true);
    expect(s.rpc).toHaveBeenCalledWith('fn_form_completar_entidade', {
      p_submission_id: SUB, p_first_name: 'Ana', p_last_name: 'Silva',
      p_street: 'Rua A 1', p_postal_code: '4000-123', p_city: 'Porto',
    });
    expect(s.from).not.toHaveBeenCalled();
  });

  it('morada incompleta nao vai; sem nada para completar nao chama', async () => {
    const s = mk(true);
    await completarSeNova({
      supabase: s.client, submission: submissao(), fieldValues: { nome: 'Ana', rua: 'Rua A', cp: '' }, definitions: defs,
    });
    expect((s.rpc.mock.calls[0] as any[])[1]).toMatchObject({ p_street: null, p_postal_code: null });
    const s2 = mk(true);
    const r = await completarSeNova({ supabase: s2.client, submission: submissao(), fieldValues: { x: 1 }, definitions: defs });
    expect(r).toBe(false);
    expect(s2.rpc).not.toHaveBeenCalled();
  });

  it('erro da funcao nao rebenta: devolve false', async () => {
    const supabase = { rpc: async () => ({ data: null, error: { message: 'boom' } }) };
    const r = await completarSeNova({ supabase, submission: submissao(), fieldValues: { nome: 'Ana' }, definitions: defs });
    expect(r).toBe(false);
  });

  it('nunca manda email, telefone, origem nem campanha', async () => {
    const s = mk(true);
    await completarSeNova({
      supabase: s.client, submission: submissao(),
      fieldValues: { nome: 'Ana', email: 'x@y.pt' }, definitions: [...defs, { field_key: 'email', contact_field_mapping: 'email' }],
    });
    const args = (s.rpc.mock.calls[0] as any[])[1];
    expect(Object.keys(args).sort()).toEqual(
      ['p_city', 'p_first_name', 'p_last_name', 'p_postal_code', 'p_street', 'p_submission_id'],
    );
  });
});
