// captarEnvio: negocio desde o inicio (4.a coluna negocio_id de fn_form_criar_entidade).
// Supabase simulado; nada toca na base.
import { describe, expect, it, vi } from 'vitest';
import { captarEnvio } from '../formCaptacao.ts';

const ORG = 'aaaaaaaa-0000-4000-8000-000000000001';
const FORM = 'ffffffff-0000-4000-8000-000000000003';
const ENT = 'eeeeeeee-0000-4000-8000-000000000005';
const SUB_NEW = '99999999-0000-4000-8000-000000000007';
const NEG = 'dddddddd-0000-4000-8000-0000000000bb';

type Handler = (args: any) => { data?: any; error?: any };

function makeSupabase(handlers: Record<string, Handler>) {
  const rpcCalls: Array<{ name: string; args: any }> = [];
  const tables: string[] = [];
  const from = (table: string) => {
    tables.push(table);
    const b: any = {
      select: () => b, update: () => b, insert: () => b, eq: () => b, is: () => b, neq: () => b,
      filter: () => b, limit: () => b, maybeSingle: () => b, single: () => b,
      then: (res: any) => Promise.resolve({ data: null, error: null }).then(res),
    };
    return b;
  };
  const rpc = (name: string, args: any) => {
    rpcCalls.push({ name, args });
    const h = handlers[name];
    return Promise.resolve(h ? h(args) : { data: null, error: null });
  };
  return { client: { from, rpc }, rpcCalls, tables };
}

const resolverOk = () => ({
  data: [{ organization_id: ORG, form_id: FORM, campaign_id: null, campaign_via: null, origin_id: null, origin_recognized: false, channel_id: null }],
});

const params = () => ({
  formId: FORM,
  fieldValues: { nome: 'Ana', apelido: 'Silva', email: 'ana@exemplo.pt', telefone: '912345678', _meta: {} } as Record<string, any>,
  definitions: [
    { field_key: 'nome', contact_field_mapping: 'first_name' },
    { field_key: 'apelido', contact_field_mapping: 'last_name' },
    { field_key: 'email', contact_field_mapping: 'email' },
    { field_key: 'telefone', contact_field_mapping: 'phone' },
  ],
  currentStep: 1, totalSteps: 1, isComplete: true,
  deps: { emitAlert: vi.fn(async () => null), emitNotification: vi.fn(async () => []) },
});

const criar = (row: Record<string, unknown>) => () => ({ data: [{ entity_id: ENT, submission_id: SUB_NEW, ...row }] });

describe('captarEnvio - negocio desde o inicio', () => {
  const novo = (row: Record<string, unknown>) => {
    const s = makeSupabase({
      fn_form_resolver_captacao: resolverOk,
      fn_form_achar_entidades: () => ({ data: [] }),
      fn_form_criar_entidade: criar(row),
    });
    return captarEnvio({ supabase: s.client, ...params() });
  };

  it('pessoa nova devolve o negocio_id da 4.a coluna como negocioId', async () => {
    expect(await novo({ created: true, negocio_id: NEG })).toMatchObject({ ok: true, created: true, negocioId: NEG });
  });
  it('negocio_id nulo (negocio nao criado) devolve negocioId null e o envio segue ok', async () => {
    expect(await novo({ created: true, negocio_id: null })).toMatchObject({ ok: true, created: true, negocioId: null });
  });
  it('base antiga sem a 4.a coluna: negocioId null, nunca undefined', async () => {
    const r = await novo({ created: true });
    expect(r).toMatchObject({ ok: true });
    if (r.ok) expect(r.negocioId).toBeNull();
  });
  it('pessoa conhecida: negocioId null e nunca toca em negocios', async () => {
    const s = makeSupabase({
      fn_form_resolver_captacao: resolverOk,
      fn_form_achar_entidades: () => ({ data: [{ entity_id: ENT, matched_by: ['email'], email: 'ana@exemplo.pt', phone: null, client_since: null, assigned_to: null, created_by: null }] }),
      upsert_form_submission: () => ({ data: SUB_NEW }),
      resolve_root_organization_id: () => ({ data: ORG }),
    });
    const r = await captarEnvio({ supabase: s.client, ...params() });
    expect(r).toMatchObject({ ok: true, created: false, negocioId: null });
    expect(s.tables).not.toContain('negocios');
    expect(s.rpcCalls.map((c) => c.name)).not.toContain('fn_form_criar_entidade');
  });
  it('corrida (created=false na criacao): negocioId null, mesmo que a linha traga um id', async () => {
    const s = makeSupabase({
      fn_form_resolver_captacao: resolverOk,
      fn_form_achar_entidades: (() => {
        let n = 0;
        return () => ({ data: n++ === 0 ? [] : [{ entity_id: ENT, matched_by: ['email'], email: 'ana@exemplo.pt' }] });
      })(),
      fn_form_criar_entidade: criar({ created: false, negocio_id: NEG }),
    });
    const r = await captarEnvio({ supabase: s.client, ...params() });
    expect(r).toMatchObject({ ok: true, created: false, negocioId: null });
  });
});
