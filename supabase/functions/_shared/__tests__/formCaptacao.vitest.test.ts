// Testes do nucleo de captacao do formulario (create-lead e insert-lead).
// Supabase simulado: regista cada rpc e cada escrita em tabela. Nada toca na base.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  captarEnvio,
  collectContactos,
  montarMorada,
  normalizarNomesNosCampos,
  resolverCaptacao,
  pickOrigemTexto,
  verificarCamposUnicos,
} from '../formCaptacao.ts';

// Permite fazer falhar a N-esima chamada a classifyDedupOutcome (1-based); 0 = nunca.
const classif = vi.hoisted(() => ({ calls: 0, throwAt: 0 }));
vi.mock('../leadDedup.ts', async (importOriginal) => {
  const m = await importOriginal<typeof import('../leadDedup.ts')>();
  return {
    ...m,
    classifyDedupOutcome: (...a: Parameters<typeof m.classifyDedupOutcome>) => {
      classif.calls += 1;
      if (classif.throwAt === classif.calls) throw new Error('classificacao rebentou');
      return m.classifyDedupOutcome(...a);
    },
  };
});

const ORG = 'aaaaaaaa-0000-4000-8000-000000000001';
const OTHER_ORG = 'bbbbbbbb-0000-4000-8000-000000000002';
const FORM = 'ffffffff-0000-4000-8000-000000000003';
const CAMP = 'cccccccc-0000-4000-8000-000000000004';
const ENT = 'eeeeeeee-0000-4000-8000-000000000005';
const ENT2 = 'eeeeeeee-0000-4000-8000-000000000006';
const SUB_NEW = '99999999-0000-4000-8000-000000000007';

type RpcHandler = (args: any) => { data?: any; error?: any };

function makeSupabase(handlers: Record<string, RpcHandler>) {
  const rpcCalls: Array<{ name: string; args: any }> = [];
  const writes: Array<{ table: string; op: string; payload?: any; filters: Array<[string, any]> }> = [];
  const reads: Array<{ table: string; filters: Array<[string, any]> }> = [];

  const from = (table: string) => {
    const state = { op: 'select', payload: undefined as any, filters: [] as Array<[string, any]> };
    const builder: any = {
      select() { return builder; },
      insert(p: any) { state.op = 'insert'; state.payload = p; return builder; },
      update(p: any) { state.op = 'update'; state.payload = p; return builder; },
      delete() { state.op = 'delete'; return builder; },
      eq(c: string, v: any) { state.filters.push([c, v]); return builder; },
      is(c: string, v: any) { state.filters.push([c + ' is', v]); return builder; },
      neq(c: string, v: any) { state.filters.push([c + ' neq', v]); return builder; },
      filter(c: string, _o: string, v: any) { state.filters.push([c, v]); return builder; },
      limit() { return builder; },
      maybeSingle() { return builder; },
      single() { return builder; },
      then(resolve: any) {
        if (state.op === 'select') reads.push({ table, filters: state.filters });
        else writes.push({ table, op: state.op, payload: state.payload, filters: state.filters });
        const data = state.op === 'select' && table === 'form_submissions' ? [] : null;
        return Promise.resolve({ data, error: null }).then(resolve);
      },
    };
    return builder;
  };

  const rpc = (name: string, args: any) => {
    rpcCalls.push({ name, args });
    const h = handlers[name];
    return Promise.resolve(h ? h(args) : { data: null, error: null });
  };
  return { client: { from, rpc }, rpcCalls, writes, reads };
}

const resolverOk = (over: Record<string, unknown> = {}) => () => ({
  data: [{
    organization_id: ORG, form_id: FORM, campaign_id: CAMP, campaign_via: 'form',
    origin_id: null, origin_recognized: false, channel_id: null, ...over,
  }],
});

const baseParams = (over: Record<string, unknown> = {}) => ({
  formId: FORM,
  campaignId: null as string | null,
  fieldValues: {
    nome: 'Ana', apelido: 'Silva', email: 'ana@exemplo.pt', telefone: '912345678',
    _meta: { current_step: 1, total_steps: 2, is_complete: false },
  } as Record<string, any>,
  definitions: [
    { field_key: 'nome', contact_field_mapping: 'first_name' },
    { field_key: 'apelido', contact_field_mapping: 'last_name' },
    { field_key: 'email', contact_field_mapping: 'email' },
    { field_key: 'telefone', contact_field_mapping: 'phone' },
  ],
  currentStep: 1,
  totalSteps: 2,
  isComplete: false,
  deps: { emitAlert: vi.fn(async () => null), emitNotification: vi.fn(async () => []) },
  ...over,
});

const criarOk = (created = true, entity = ENT, sub = SUB_NEW) => () => ({
  data: [{ entity_id: entity, submission_id: sub, created }],
});

describe('helpers puros', () => {
  it('pickOrigemTexto: utm_source ganha em embed utm', () => {
    expect(pickOrigemTexto({ embedKind: 'utm', tracking: { utm_source: ' google ' }, source: 'x' })).toBe('google');
  });
  it('pickOrigemTexto: click-id sem utm_source', () => {
    expect(pickOrigemTexto({ embedKind: 'utm', tracking: { gclid: 'abc' }, source: null })).toBe('Google Ads');
  });
  it('pickOrigemTexto: ignora public_form, public_api e vazio', () => {
    expect(pickOrigemTexto({ embedKind: '', tracking: null, source: 'public_form' })).toBeNull();
    expect(pickOrigemTexto({ embedKind: '', tracking: null, source: 'public_api' })).toBeNull();
    expect(pickOrigemTexto({ embedKind: '', tracking: null, source: '   ' })).toBeNull();
  });
  it('pickOrigemTexto: texto de source normal passa', () => {
    expect(pickOrigemTexto({ embedKind: '', tracking: null, source: 'Website' })).toBe('Website');
  });

  it('collectContactos: vazios ou so espacos viram null', () => {
    expect(collectContactos('   ', '')).toEqual({ email: null, phone: null, extraEmails: [], extraPhones: [] });
    expect(collectContactos(null, undefined).email).toBeNull();
  });
  it('collectContactos: so o primeiro valido vai, o resto fica em extra', () => {
    const r = collectContactos(['a@x.pt', 'b@x.pt', 'A@X.PT'], ['912345678', '923456789']);
    expect(r.email).toBe('a@x.pt');
    expect(r.extraEmails).toEqual(['b@x.pt']);
    expect(r.phone).toBe('912345678');
    expect(r.extraPhones).toEqual(['923456789']);
  });
  it('collectContactos: salta invalidos antes de escolher o primeiro', () => {
    expect(collectContactos(['n/a', 'ok@x.pt'], null).email).toBe('ok@x.pt');
  });

  it('montarMorada: so com rua e codigo postal', () => {
    expect(montarMorada('Rua A', '', 'Porto')).toBeNull();
    expect(montarMorada('', '4000-000', 'Porto')).toBeNull();
    expect(montarMorada('Rua A', '4000-123', '')).toEqual({ street: 'Rua A', postal_code: '4000-123', city: null });
  });
  it('montarMorada: nunca aceita N/A nem 0000-000', () => {
    expect(montarMorada('N/A', '4000-123', 'x')).toBeNull();
    expect(montarMorada('Rua A', '0000-000', 'x')).toBeNull();
  });
});

describe('captarEnvio - entidade nova', () => {
  it('sem campanha so chama fn_form_criar_entidade e nunca toca em anew_leads, papeis ou ligacoes', async () => {
    const s = makeSupabase({
      fn_form_resolver_captacao: resolverOk({ campaign_id: null, campaign_via: null }),
      fn_form_achar_entidades: () => ({ data: [] }),
      fn_form_criar_entidade: criarOk(),
    });
    const r = await captarEnvio({ supabase: s.client, ...baseParams() });
    expect(r.ok).toBe(true);
    const names = s.rpcCalls.map((c) => c.name);
    expect(names).toContain('fn_form_criar_entidade');
    expect(names).not.toContain('upsert_form_submission');
    expect(names).not.toContain('create_entity_with_contacts_and_roles');
    const tables = [...s.writes, ...s.reads].map((w) => w.table);
    for (const t of ['anew_leads', 'anew_entity_roles', 'anew_entity_org_links', 'anew_clients']) {
      expect(tables).not.toContain(t);
    }
    expect(s.writes).toHaveLength(0);
    if (r.ok) {
      expect(r.submissionId).toBe(SUB_NEW);
      expect(r.created).toBe(true);
    }
  });

  it('email e telefone vazios ou so espacos viram null antes da chamada', async () => {
    const s = makeSupabase({
      fn_form_resolver_captacao: resolverOk(),
      fn_form_achar_entidades: () => ({ data: [] }),
      fn_form_criar_entidade: criarOk(),
    });
    await captarEnvio({
      supabase: s.client,
      ...baseParams({ fieldValues: { nome: 'Ana', email: '   ', telefone: ' ', _meta: {} } }),
    });
    const args = s.rpcCalls.find((c) => c.name === 'fn_form_criar_entidade')!.args;
    expect(args.p_email).toBeNull();
    expect(args.p_phone).toBeNull();
  });

  it('morada so com rua e codigo postal; incompleta nunca vai', async () => {
    const mk = async (fv: Record<string, any>) => {
      const s = makeSupabase({
        fn_form_resolver_captacao: resolverOk(),
        fn_form_achar_entidades: () => ({ data: [] }),
        fn_form_criar_entidade: criarOk(),
      });
      await captarEnvio({
        supabase: s.client,
        ...baseParams({
          fieldValues: { ...fv, _meta: {} },
          definitions: [
            { field_key: 'rua', contact_field_mapping: 'address' },
            { field_key: 'cp', contact_field_mapping: 'postal_code' },
            { field_key: 'loc', contact_field_mapping: 'city' },
          ],
        }),
      });
      return s.rpcCalls.find((c) => c.name === 'fn_form_criar_entidade')!.args;
    };
    const completa = await mk({ rua: 'Rua A 1', cp: '4000-123', loc: 'Porto' });
    expect([completa.p_street, completa.p_postal_code, completa.p_city]).toEqual(['Rua A 1', '4000-123', 'Porto']);
    const semCp = await mk({ rua: 'Rua A 1', cp: '', loc: 'Porto' });
    expect([semCp.p_street, semCp.p_postal_code, semCp.p_city]).toEqual([null, null, null]);
    const semRua = await mk({ rua: ' ', cp: '4000-123', loc: 'Porto' });
    expect(semRua.p_street).toBeNull();
    expect(semRua.p_postal_code).toBeNull();
  });

  it('dois emails e dois telefones: so o primeiro vai, o resto em extra', async () => {
    const s = makeSupabase({
      fn_form_resolver_captacao: resolverOk(),
      fn_form_achar_entidades: () => ({ data: [] }),
      fn_form_criar_entidade: criarOk(),
    });
    await captarEnvio({
      supabase: s.client,
      ...baseParams({
        fieldValues: { email: ['a@x.pt', 'b@x.pt'], telefone: ['912345678', '923456789'], _meta: {} },
      }),
    });
    const a = s.rpcCalls.find((c) => c.name === 'fn_form_criar_entidade')!.args;
    expect(a.p_email).toBe('a@x.pt');
    expect(a.p_phone).toBe('912345678');
    expect(a.p_extra).toMatchObject({ extra_emails: ['b@x.pt'], extra_phones: ['923456789'] });
  });

  it('passa ao SQL o que o resolver decidiu e origem sem reconhecimento fica null', async () => {
    const s = makeSupabase({
      fn_form_resolver_captacao: resolverOk({ origin_id: null, origin_recognized: false, channel_id: null }),
      fn_form_achar_entidades: () => ({ data: [] }),
      fn_form_criar_entidade: criarOk(),
    });
    await captarEnvio({ supabase: s.client, ...baseParams({ origemTexto: 'qualquer coisa' }) });
    const a = s.rpcCalls.find((c) => c.name === 'fn_form_criar_entidade')!.args;
    expect(a.p_origin_id).toBeNull();
    expect(a.p_origin_recognized).toBe(false);
    expect(a.p_organization_id).toBe(ORG);
    expect(a.p_form_id).toBe(FORM);
    // o resolver recebeu o texto da origem
    expect(s.rpcCalls[0].args.p_origem).toBe('qualquer coisa');
  });

  it('nunca manda created_by nem organizacao raiz do cliente', async () => {
    const s = makeSupabase({
      fn_form_resolver_captacao: resolverOk(),
      fn_form_achar_entidades: () => ({ data: [] }),
      fn_form_criar_entidade: criarOk(),
    });
    await captarEnvio({ supabase: s.client, ...baseParams() });
    const a = s.rpcCalls.find((c) => c.name === 'fn_form_criar_entidade')!.args;
    expect(a).not.toHaveProperty('p_created_by');
    expect(a).not.toHaveProperty('p_root_organization_id');
  });
});

describe('resolverCaptacao e resolvido pre-obtido', () => {
  it('resolverCaptacao devolve a organizacao e as ids, ou o abort sem escrever', async () => {
    const ok = makeSupabase({ fn_form_resolver_captacao: resolverOk() });
    const r = await resolverCaptacao(ok.client, { formId: FORM });
    expect(r).toMatchObject({ ok: true, organizationId: ORG, formId: FORM, campaignId: CAMP });
    const no = makeSupabase({ fn_form_resolver_captacao: () => ({ data: [{ organization_id: null }] }) });
    expect(await resolverCaptacao(no.client, { formId: FORM })).toMatchObject({ ok: false, status: 404 });
    expect(await resolverCaptacao(no.client, { formId: FORM, tokenOrganizationId: ORG })).toMatchObject({ ok: false, status: 403 });
  });

  it('captarEnvio com resolvido nao chama o resolver outra vez', async () => {
    const s = makeSupabase({
      fn_form_achar_entidades: () => ({ data: [] }),
      fn_form_criar_entidade: criarOk(),
    });
    const resolvido = {
      organizationId: ORG, formId: FORM, campaignId: null, campaignVia: null,
      originId: null, originRecognized: false, channelId: null,
    };
    const r = await captarEnvio({ supabase: s.client, ...baseParams(), resolvido });
    expect(r.ok).toBe(true);
    expect(s.rpcCalls.map((c) => c.name)).not.toContain('fn_form_resolver_captacao');
    expect(s.rpcCalls.find((c) => c.name === 'fn_form_criar_entidade')!.args.p_organization_id).toBe(ORG);
  });
});

describe('normalizarNomesNosCampos', () => {
  it('parte o nome completo repetido nos dois campos, sem mutar o original', () => {
    const original = { nome: 'Ana Silva', apelido: 'Ana Silva', _meta: { a: 1 } };
    const defs = [
      { field_key: 'nome', contact_field_mapping: 'first_name' },
      { field_key: 'apelido', contact_field_mapping: 'last_name' },
    ];
    const novo = normalizarNomesNosCampos(original, defs);
    expect(novo).toMatchObject({ nome: 'Ana', apelido: 'Silva' });
    expect(original.nome).toBe('Ana Silva');
  });
  it('nao inventa chaves quando nada mudou', () => {
    const original = { nome: 'Ana', apelido: 'Silva' };
    const defs = [
      { field_key: 'nome', contact_field_mapping: 'first_name' },
      { field_key: 'apelido', contact_field_mapping: 'last_name' },
    ];
    expect(normalizarNomesNosCampos(original, defs)).toEqual(original);
  });
});

describe('captarEnvio - insert-lead (organizacao do token)', () => {
  it('campanha de outra organizacao / pausada: o resolver devolve sem campanha e o envio segue (sem campanha)', async () => {
    const s = makeSupabase({
      fn_form_resolver_captacao: resolverOk({ campaign_id: null, campaign_via: null, channel_id: null }),
      fn_form_achar_entidades: () => ({ data: [] }),
      fn_form_criar_entidade: criarOk(),
    });
    const r = await captarEnvio({
      supabase: s.client, ...baseParams({ formId: null, campaignId: CAMP, tokenOrganizationId: ORG }),
    });
    expect(r).toMatchObject({ ok: true, created: true, campaignId: null });
    const a = s.rpcCalls.find((c) => c.name === 'fn_form_criar_entidade')!.args;
    expect(a.p_campaign_id).toBeNull();
    expect(a.p_channel_id).toBeNull();
    expect(s.rpcCalls[0].args).toMatchObject({ p_organization_id: ORG, p_campaign_id: CAMP });
  });
});

describe('captarEnvio - abortar sem escrever', () => {
  it('organization_id NULL do resolver aborta com 404 sem escrita nenhuma', async () => {
    const s = makeSupabase({
      fn_form_resolver_captacao: () => ({ data: [{ organization_id: null, form_id: null, campaign_id: null }] }),
    });
    const r = await captarEnvio({ supabase: s.client, ...baseParams() });
    expect(r).toMatchObject({ ok: false, status: 404 });
    expect(s.rpcCalls.map((c) => c.name)).toEqual(['fn_form_resolver_captacao']);
    expect(s.writes).toHaveLength(0);
  });

  it('resolver sem linhas tambem aborta', async () => {
    const s = makeSupabase({ fn_form_resolver_captacao: () => ({ data: [] }) });
    const r = await captarEnvio({ supabase: s.client, ...baseParams() });
    expect(r).toMatchObject({ ok: false, status: 404 });
  });

  it('organizacao do token diferente da do formulario: 403 e zero escritas', async () => {
    const s = makeSupabase({
      fn_form_resolver_captacao: () => ({ data: [{ organization_id: null }] }),
    });
    const r = await captarEnvio({ supabase: s.client, ...baseParams({ tokenOrganizationId: OTHER_ORG }) });
    expect(r).toMatchObject({ ok: false, status: 403 });
    expect(s.rpcCalls[0].args.p_organization_id).toBe(OTHER_ORG);
    expect(s.writes).toHaveLength(0);
    expect(s.rpcCalls).toHaveLength(1);
  });

  it('erro do resolver: 500 generico sem detalhes internos', async () => {
    const s = makeSupabase({ fn_form_resolver_captacao: () => ({ error: { message: 'relation x secret' } }) });
    const r = await captarEnvio({ supabase: s.client, ...baseParams() });
    expect(r).toMatchObject({ ok: false, status: 500 });
    expect(JSON.stringify(r)).not.toContain('secret');
  });

  it('pesquisa de entidades falhada: 503 RETRY e nada criado nem escrito (sem duplicado)', async () => {
    const s = makeSupabase({
      fn_form_resolver_captacao: resolverOk(),
      fn_form_achar_entidades: () => ({ error: { message: 'timeout secret' } }),
      fn_form_criar_entidade: criarOk(),
    });
    const r = await captarEnvio({ supabase: s.client, ...baseParams() });
    expect(r).toMatchObject({ ok: false, status: 503, code: 'RETRY' });
    expect(JSON.stringify(r)).not.toContain('secret');
    const names = s.rpcCalls.map((c) => c.name);
    expect(names).not.toContain('fn_form_criar_entidade');
    expect(names).not.toContain('upsert_form_submission');
    expect(s.writes).toHaveLength(0);
  });

  it('22023 ao criar: 400 sem detalhes internos', async () => {
    const s = makeSupabase({
      fn_form_resolver_captacao: resolverOk(),
      fn_form_achar_entidades: () => ({ data: [] }),
      fn_form_criar_entidade: () => ({ error: { code: '22023', message: 'canal de outra org secret' } }),
    });
    const r = await captarEnvio({ supabase: s.client, ...baseParams() });
    expect(r).toMatchObject({ ok: false, status: 400 });
    expect(JSON.stringify(r)).not.toContain('secret');
  });
});

describe('captarEnvio - ficha conhecida', () => {
  const candidato = (over: Record<string, unknown> = {}) => ({
    entity_id: ENT, matched_by: ['email'], email: 'ana@exemplo.pt', phone: null,
    client_since: null, assigned_to: 'user-1', created_by: null, ...over,
  });

  const known = (cands: any[], extra: Record<string, RpcHandler> = {}) =>
    makeSupabase({
      fn_form_resolver_captacao: resolverOk(),
      fn_form_achar_entidades: () => ({ data: cands }),
      upsert_form_submission: () => ({ data: SUB_NEW }),
      resolve_root_organization_id: () => ({ data: ORG }),
      ...extra,
    });

  it('devolve a submissao NOVA e so escreve o carimbo em anew_entities', async () => {
    const s = known([candidato()]);
    const p = baseParams();
    const r = await captarEnvio({ supabase: s.client, ...p });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.submissionId).toBe(SUB_NEW);
      expect(r.created).toBe(false);
      expect(r.entityId).toBe(ENT);
    }
    expect(s.rpcCalls.map((c) => c.name)).not.toContain('fn_form_criar_entidade');
    const ent = s.writes.filter((w) => w.table === 'anew_entities');
    expect(ent).toHaveLength(1);
    expect(Object.keys(ent[0].payload)).toEqual(['last_activity_at']);
    expect(ent[0].filters).toEqual(expect.arrayContaining([['id', ENT], ['organization_id', ORG]]));
    for (const t of ['anew_entity_emails', 'anew_entity_phones', 'anew_entity_addresses', 'anew_addresses', 'anew_leads']) {
      expect(s.writes.map((w) => w.table)).not.toContain(t);
    }
    expect(p.deps.emitAlert).toHaveBeenCalledTimes(1);
    expect(p.deps.emitNotification).toHaveBeenCalledTimes(1);
  });

  it('target_type enviado ao toque e lead com target_id = entity_id (nunca NULL nem entity)', async () => {
    const s = known([candidato()]);
    await captarEnvio({ supabase: s.client, ...baseParams() });
    const a = s.rpcCalls.find((c) => c.name === 'upsert_form_submission')!.args;
    expect(a.p_target_type).toBe('lead');
    expect(a.p_target_id).toBe(ENT);
    expect(a.p_entity_id).toBe(ENT);
    expect(a.p_organization_id).toBe(ORG);
  });

  it('o toque de ficha conhecida marca _meta.dedup e nao a marca entidade_nova', async () => {
    const s = known([candidato()]);
    await captarEnvio({ supabase: s.client, ...baseParams() });
    const a = s.rpcCalls.find((c) => c.name === 'upsert_form_submission')!.args;
    expect(a.p_field_values._meta.dedup).toMatchObject({ kind: 'MATCH_EMAIL', por: 'email' });
    expect(a.p_field_values._meta.entidade_nova).toBeUndefined();
  });

  it('o alerta sai sem diff e com a entidade como destino; cliente decide-se por client_since', async () => {
    const s = known([candidato({ client_since: '2026-01-01' })]);
    const p = baseParams();
    await captarEnvio({ supabase: s.client, ...p });
    const alertArgs = (p.deps.emitAlert.mock.calls[0] as any[])[0];
    expect(alertArgs.fieldValuesDiff).toBeNull();
    expect(alertArgs.summary).toMatchObject({ targetType: 'client', targetId: ENT, clientId: ENT, activeLeadId: null });
    const notifArgs = (p.deps.emitNotification.mock.calls[0] as any[])[0];
    expect(notifArgs.target).toMatchObject({ targetType: 'client', targetId: ENT, assigneeAnewUserId: 'user-1' });
    expect(notifArgs.submissionId).toBe(SUB_NEW);
  });

  it('assigned_to nulo cai para created_by', async () => {
    const s = known([candidato({ assigned_to: null, created_by: 'user-9' })]);
    const p = baseParams();
    await captarEnvio({ supabase: s.client, ...p });
    expect((p.deps.emitNotification.mock.calls[0] as any[])[0].target.assigneeAnewUserId).toBe('user-9');
  });

  it('created = false (corrida) segue pelo ramo conhecido, sem segundo toque', async () => {
    const s = makeSupabase({
      fn_form_resolver_captacao: resolverOk(),
      fn_form_achar_entidades: (() => {
        let n = 0;
        return () => ({ data: n++ === 0 ? [] : [candidato()] });
      })(),
      fn_form_criar_entidade: criarOk(false, ENT, SUB_NEW),
    });
    const p = baseParams();
    const r = await captarEnvio({ supabase: s.client, ...p });
    expect(r).toMatchObject({ ok: true, created: false, entityId: ENT, submissionId: SUB_NEW });
    expect(s.rpcCalls.map((c) => c.name)).not.toContain('upsert_form_submission');
    expect(s.writes.filter((w) => w.table === 'anew_entities')).toHaveLength(1);
    expect(p.deps.emitAlert).toHaveBeenCalledTimes(1);
  });

  it('conflito: email numa ficha e telefone noutra preenche conflicting_entity_id', async () => {
    const s = known([
      candidato({ entity_id: ENT, matched_by: ['email'], email: 'ana@exemplo.pt', phone: null }),
      candidato({ entity_id: ENT2, matched_by: ['phone'], email: null, phone: '912345678' }),
    ]);
    await captarEnvio({ supabase: s.client, ...baseParams() });
    const up = s.writes.find((w) => w.table === 'form_submissions' && w.op === 'update')!;
    expect(up.payload).toEqual({ conflicting_entity_id: ENT2 });
    expect(up.filters).toEqual(expect.arrayContaining([['id', SUB_NEW], ['organization_id', ORG]]));
  });

  it('origem e campanha nao sobrescrevem as da entidade num segundo envio', async () => {
    const s = known([candidato()]);
    await captarEnvio({ supabase: s.client, ...baseParams({ originId: 'dddddddd-0000-4000-8000-000000000009' }) });
    const ent = s.writes.filter((w) => w.table === 'anew_entities');
    for (const w of ent) {
      expect(w.payload).not.toHaveProperty('origin_id');
      expect(w.payload).not.toHaveProperty('campaign_id');
    }
  });

  it('falha do alerta nao parte o envio (best effort)', async () => {
    const s = known([candidato()]);
    const p = baseParams({
      deps: {
        emitAlert: vi.fn(async () => { throw new Error('boom'); }),
        emitNotification: vi.fn(async () => []),
      },
    });
    const r = await captarEnvio({ supabase: s.client, ...p });
    expect(r.ok).toBe(true);
    expect(p.deps.emitNotification).toHaveBeenCalled();
  });

  it('falha do upsert: 500 sem detalhes internos', async () => {
    const s = known([candidato()], { upsert_form_submission: () => ({ error: { message: 'secret trigger' } }) });
    const r = await captarEnvio({ supabase: s.client, ...baseParams() });
    expect(r).toMatchObject({ ok: false, status: 500 });
    expect(JSON.stringify(r)).not.toContain('secret');
  });

  it('a pesquisa de entidades leva a organizacao resolvida e os dados normalizados', async () => {
    const s2 = makeSupabase({
      fn_form_resolver_captacao: resolverOk(),
      fn_form_achar_entidades: () => ({ data: [] }),
      fn_form_criar_entidade: criarOk(),
    });
    await captarEnvio({ supabase: s2.client, ...baseParams({ nifHash: 'hash123' }) });
    const a = s2.rpcCalls.find((c) => c.name === 'fn_form_achar_entidades')!.args;
    expect(a).toEqual({ p_organization_id: ORG, p_email: 'ana@exemplo.pt', p_phone: '912345678', p_nif_hash: 'hash123' });
  });
});

describe('verificarCamposUnicos (is_unique sobre form_submissions)', () => {
  it('consulta form_submissions com organizacao, formulario e nao apagadas', async () => {
    const reads: any[] = [];
    const supabase = {
      from(table: string) {
        const f: Array<[string, any]> = [];
        const b: any = {
          select: () => b,
          eq: (c: string, v: any) => { f.push([c, v]); return b; },
          is: (c: string, v: any) => { f.push([c + ' is', v]); return b; },
          neq: (c: string, v: any) => { f.push([c + ' neq', v]); return b; },
          filter: (c: string, _o: string, v: any) => { f.push([c, v]); return b; },
          limit: () => b,
          maybeSingle: () => { reads.push({ table, f }); return Promise.resolve({ data: { id: 'x' }, error: null }); },
        };
        return b;
      },
    };
    const dup = await verificarCamposUnicos({
      supabase,
      organizationId: ORG,
      formId: FORM,
      definitions: [{ field_key: 'nif', field_label: 'NIF', is_unique: true }],
      fieldValues: { nif: '123' },
      excludeSubmissionId: 'sub-1',
    });
    expect(dup).toMatchObject({ fieldKey: 'nif', fieldLabel: 'NIF', value: '123' });
    expect(reads[0].table).toBe('form_submissions');
    expect(reads[0].f).toEqual(expect.arrayContaining([
      ['organization_id', ORG], ['form_id', FORM], ['deleted_at is', null],
      ['field_values->>nif', '123'], ['id neq', 'sub-1'],
    ]));
  });

  it('sem valor ou sem is_unique nao consulta nada', async () => {
    const supabase = { from: () => { throw new Error('nao devia consultar'); } };
    const dup = await verificarCamposUnicos({
      supabase,
      organizationId: ORG,
      formId: FORM,
      definitions: [{ field_key: 'a', is_unique: true }, { field_key: 'b', is_unique: false }],
      fieldValues: { a: '', b: 'x' },
    });
    expect(dup).toBeNull();
  });
});

describe('captarEnvio - falhas de classificacao e de gravacao do conflito', () => {
  const cand = (over: Record<string, unknown> = {}) => ({
    entity_id: ENT, matched_by: ['email'], email: 'ana@exemplo.pt', phone: null,
    client_since: null, assigned_to: 'user-1', created_by: null, ...over,
  });
  const comCaptura = () => {
    const captureError = vi.fn(async () => undefined);
    return { captureError, deps: { emitAlert: vi.fn(async () => null), emitNotification: vi.fn(async () => []), captureError } };
  };
  beforeEach(() => { classif.calls = 0; classif.throwAt = 0; });

  it('1.a classificacao a falhar: 503 RETRY, nada criado nem escrito, e regista', async () => {
    classif.throwAt = 1;
    const s = makeSupabase({
      fn_form_resolver_captacao: resolverOk(),
      fn_form_achar_entidades: () => ({ data: [cand()] }),
      fn_form_criar_entidade: criarOk(),
      upsert_form_submission: () => ({ data: SUB_NEW }),
    });
    const c = comCaptura();
    const r = await captarEnvio({ supabase: s.client, ...baseParams({ deps: c.deps }) });
    expect(r).toMatchObject({ ok: false, status: 503, code: 'RETRY' });
    const names = s.rpcCalls.map((x) => x.name);
    expect(names).not.toContain('fn_form_criar_entidade');
    expect(names).not.toContain('upsert_form_submission');
    expect(s.writes).toHaveLength(0);
    expect(c.captureError).toHaveBeenCalledTimes(1);
  });

  it('2.a classificacao a falhar depois do toque gravado: sucesso, sem 500 e regista', async () => {
    classif.throwAt = 2;
    const s = makeSupabase({
      fn_form_resolver_captacao: resolverOk(),
      fn_form_achar_entidades: (() => {
        let n = 0;
        return () => ({ data: n++ === 0 ? [] : [cand()] });
      })(),
      fn_form_criar_entidade: criarOk(false, ENT, SUB_NEW),
    });
    const c = comCaptura();
    const r = await captarEnvio({ supabase: s.client, ...baseParams({ deps: c.deps }) });
    expect(r).toMatchObject({ ok: true, created: false, entityId: ENT, submissionId: SUB_NEW });
    expect(s.rpcCalls.map((x) => x.name)).not.toContain('upsert_form_submission');
    expect(c.captureError).toHaveBeenCalledTimes(1);
  });

  it('2.a pesquisa a falhar depois do toque gravado: sucesso degradado, regista e nao avisa ninguem (destino desconhecido)', async () => {
    const s = makeSupabase({
      fn_form_resolver_captacao: resolverOk(),
      fn_form_achar_entidades: (() => {
        let n = 0;
        return () => (n++ === 0 ? { data: [] } : { data: null, error: { message: 'pesquisa caiu' } });
      })(),
      fn_form_criar_entidade: criarOk(false, ENT, SUB_NEW),
    });
    const c = comCaptura();
    const r = await captarEnvio({ supabase: s.client, ...baseParams({ deps: c.deps }) });
    expect(r).toMatchObject({ ok: true, created: false, entityId: ENT, submissionId: SUB_NEW, degradado: true });
    expect(c.captureError).toHaveBeenCalledTimes(1);
    expect(c.deps.emitAlert).not.toHaveBeenCalled();
    expect(c.deps.emitNotification).not.toHaveBeenCalled();
  });

  it('falha ao gravar conflicting_entity_id: regista, e o conflito vai tambem em _meta.dedup.conflito no mesmo upsert', async () => {
    const s = makeSupabase({
      fn_form_resolver_captacao: resolverOk(),
      fn_form_achar_entidades: () => ({ data: [
        cand({ entity_id: ENT, matched_by: ['email'], email: 'ana@exemplo.pt', phone: null }),
        cand({ entity_id: ENT2, matched_by: ['phone'], email: null, phone: '912345678' }),
      ] }),
      upsert_form_submission: () => ({ data: SUB_NEW }),
      resolve_root_organization_id: () => ({ data: ORG }),
    });
    const from = s.client.from;
    const client = {
      ...s.client,
      from: (t: string) => {
        const b: any = from(t);
        if (t !== 'form_submissions') return b;
        const upd = b.update;
        b.update = (pl: any) => { upd(pl); b.then = (res: any) => Promise.resolve({ data: null, error: { message: 'falhou' } }).then(res); return b; };
        return b;
      },
    };
    const c = comCaptura();
    const r = await captarEnvio({ supabase: client, ...baseParams({ deps: c.deps }) });
    expect(r.ok).toBe(true);
    expect(c.captureError).toHaveBeenCalledTimes(1);
    const up = s.rpcCalls.find((x) => x.name === 'upsert_form_submission')!.args;
    expect(up.p_field_values._meta.dedup.conflito).toBe(ENT2);
  });
});
