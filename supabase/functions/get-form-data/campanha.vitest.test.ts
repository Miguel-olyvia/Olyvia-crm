// get-form-data: o que a campanha acrescenta a resposta do formulario.
import { describe, expect, it, vi } from 'vitest';
import { carregarCampanha, escolherCampanha } from './campanha.ts';

const ORG = 'aaaaaaaa-0000-4000-8000-000000000001';
const FORM = 'ffffffff-0000-4000-8000-000000000003';
const CAMP = 'cccccccc-0000-4000-8000-000000000004';
const SRC = 'dddddddd-0000-4000-8000-000000000009';

const resolverRow = (over: Record<string, unknown> = {}) => ({
  organization_id: ORG, form_id: FORM, campaign_id: CAMP, campaign_via: 'formulario',
  origin_id: SRC, origin_recognized: true, channel_id: null, ...over,
});

function makeSupabase(rows: any[] | null, campRow: any = { id: CAMP, name: 'Camp' }) {
  const rpc = vi.fn(async () => ({ data: rows, error: null }));
  const filters: Array<[string, any]> = [];
  const from = vi.fn(() => {
    const b: any = {
      select: () => b,
      eq: (c: string, v: any) => { filters.push([c, v]); return b; },
      maybeSingle: () => Promise.resolve({ data: campRow, error: null }),
    };
    return b;
  });
  return { client: { rpc, from }, rpc, from, filters };
}

describe('escolherCampanha', () => {
  it('sem campanha valida devolve null (o formulario responde na mesma)', () => {
    expect(escolherCampanha({ campaignId: null, originId: null }, null)).toBeNull();
    expect(escolherCampanha(null, null)).toBeNull();
  });
  it('com campanha devolve id, nome e origem por omissao', () => {
    expect(escolherCampanha({ campaignId: CAMP, originId: SRC }, { id: CAMP, name: 'Camp' }))
      .toEqual({ campaign_id: CAMP, campaign_name: 'Camp', default_source_id: SRC });
  });
});

describe('carregarCampanha', () => {
  it('campanha pausada ou fora de datas: o resolver devolve formulario sem campanha e segue (200)', async () => {
    const s = makeSupabase([resolverRow({ campaign_id: null, campaign_via: null, origin_id: null })]);
    const r = await carregarCampanha(s.client, { formId: FORM, campaignId: CAMP });
    expect(r).toEqual({ ok: true, formId: FORM, organizationId: ORG, campanha: null });
    expect(s.from).not.toHaveBeenCalled();
  });

  it('varias campanhas ativas no mesmo formulario: a escolhida pela base nao e anulada', async () => {
    const s = makeSupabase([resolverRow()]);
    const r = await carregarCampanha(s.client, { formId: FORM, campaignId: null });
    expect(r).toMatchObject({ ok: true, campanha: { campaign_id: CAMP, campaign_name: 'Camp', default_source_id: SRC } });
    // o nome so se le da campanha escolhida e da mesma organizacao
    expect(s.filters).toEqual(expect.arrayContaining([['id', CAMP], ['organization_id', ORG]]));
  });

  it('formulario ou campanha inexistente: 404 sem detalhes', async () => {
    const s = makeSupabase([{ organization_id: null }]);
    expect(await carregarCampanha(s.client, { formId: FORM, campaignId: null })).toEqual({
      ok: false, status: 404, error: 'Form not found',
    });
  });

  it('erro do resolver: 500 generico', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: 'secret' } }));
    const r = await carregarCampanha({ rpc, from: vi.fn() }, { formId: FORM, campaignId: null });
    expect(r).toMatchObject({ ok: false, status: 500 });
    expect(JSON.stringify(r)).not.toContain('secret');
  });

  it('chama o resolver sem origem nem organizacao (so formulario e campanha)', async () => {
    const s = makeSupabase([resolverRow()]);
    await carregarCampanha(s.client, { formId: FORM, campaignId: CAMP });
    expect(s.rpc).toHaveBeenCalledWith('fn_form_resolver_captacao', {
      p_form_id: FORM, p_campaign_id: CAMP, p_origem: null, p_organization_id: null, p_origin_id: null,
    });
  });
});
