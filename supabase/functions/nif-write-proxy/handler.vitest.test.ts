// nif-write-proxy (handler): neg_guardar_nif_pessoa na lista fechada, hash/cifra/tokens calculados aqui, NIF vazio limpa, NIF nunca em log nem em erro.
// Supabase simulado; nada toca na base.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('npm:zod', async () => await import('zod'));
const identidade = vi.hoisted(() => ({ authUid: 'u1', isServiceRole: false, falha: false }));
vi.mock('../_shared/auth.ts', () => ({
  resolveCallerIdentity: async () => {
    if (identidade.falha) throw new Error('sem jwt valido');
    return { authUid: identidade.authUid, anewUserId: 'a1', isServiceRole: identidade.isServiceRole };
  },
  authErrorResponse: () => new Response(null, { status: 401 }),
}));
vi.mock('../_shared/sentry.ts', () => ({ captureError: async () => undefined }));

import {
  ALLOWED_RPCS,
  handleNifWriteProxyRequest,
  redactNif,
  resetNifRateLimitForTests,
  nifRateLimitKeyCountForTests,
  NIF_RATE_LIMIT_MAX,
  NIF_RATE_LIMIT_SWEEP_EVERY,
  NIF_RATE_LIMIT_WINDOW_MS,
} from './handler.ts';

(globalThis as Record<string, unknown>).Deno = { env: { get: () => undefined } };

const NIF = '123456789';
const ORG = 'b6ffce4f-f630-4933-833a-008649757a33';
const PESSOA = 'aaaaaaaa-0000-4000-8000-000000000009';
const chave = () => crypto.getRandomValues(new Uint8Array(32));

function montar(rpcResult: { data?: unknown; error?: { message: string; status?: number; code?: string } | null } = {}) {
  const chamadas: Array<{ rpc: string; params: Record<string, unknown>; cliente: 'utilizador' | 'servico'; cabecalho?: string }> = [];
  const clienteServicoCriado: string[] = [];
  const fazerCliente = (cliente: 'utilizador' | 'servico', cabecalho?: string) => ({
    rpc: async (rpc: string, params: Record<string, unknown>) => {
      chamadas.push({ rpc, params, cliente, cabecalho });
      return { data: rpcResult.data ?? { mudou: true }, error: rpcResult.error ?? null };
    },
  });
  const deps = {
    supabaseAdmin: {},
    createUserClient: (cabecalho: string) => fazerCliente('utilizador', cabecalho),
    createServiceClient: () => { clienteServicoCriado.push('x'); return fazerCliente('servico'); },
    getEncKey: chave,
    getHmacKey: chave,
  };
  const chamar = (corpo: unknown) => handleNifWriteProxyRequest(
    new Request('https://x.test/nif-write-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer t' },
      body: JSON.stringify(corpo),
    }),
    deps,
  );
  return { chamadas, chamar, clienteServicoCriado };
}

beforeEach(() => { identidade.authUid = 'u1'; identidade.isServiceRole = false; identidade.falha = false; resetNifRateLimitForTests(); });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('nif-write-proxy: neg_guardar_nif_pessoa', () => {
  it('esta na lista fechada', () => {
    expect(ALLOWED_RPCS).toContain('neg_guardar_nif_pessoa');
  });

  it('NIF preenchido: passa p_nif aparado e calcula hash, cifra e tokens', async () => {
    const { chamadas, chamar } = montar();
    const r = await chamar({
      rpc: 'neg_guardar_nif_pessoa', nif: ` ${NIF} `,
      params: { p_organization_id: ORG, p_entity_id: PESSOA, p_nif: 'lixo-do-cliente' },
    });
    expect(r.status).toBe(200);
    expect(chamadas).toHaveLength(1);
    const p = chamadas[0].params;
    expect(p.p_organization_id).toBe(ORG);
    expect(p.p_entity_id).toBe(PESSOA);
    expect(p.p_nif).toBe(NIF);
    expect(p.p_nif_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(typeof p.p_nif_encrypted).toBe('string');
    expect('p_nif_tokens' in p).toBe(false);
  });

  it('tokens vindos do cliente sao descartados e nunca chegam a RPC', async () => {
    const { chamadas, chamar } = montar();
    await chamar({
      rpc: 'neg_guardar_nif_pessoa', nif: NIF,
      params: { p_organization_id: ORG, p_entity_id: PESSOA, p_nif_tokens: ['evil'] },
    });
    expect('p_nif_tokens' in chamadas[0].params).toBe(false);
  });

  it('NIF vazio limpa: hash, cifra e tokens a NULL e p_nif vazio', async () => {
    for (const nif of [undefined, null, '', '   ']) {
      const { chamadas, chamar } = montar();
      const r = await chamar({
        rpc: 'neg_guardar_nif_pessoa', nif,
        params: { p_organization_id: ORG, p_entity_id: PESSOA, p_nif_hash: 'x'.repeat(64) },
      });
      expect(r.status).toBe(200);
      const p = chamadas[0].params;
      expect(p.p_nif_hash).toBeNull();
      expect(p.p_nif_encrypted).toBeNull();
      expect('p_nif_tokens' in p).toBe(false);
      expect(p.p_nif ?? '').toBe('');
    }
  });

  it('outras RPCs com NIF continuam a receber os tokens calculados', async () => {
    const { chamadas, chamar } = montar();
    await chamar({ rpc: 'rpc_update_client', nif: NIF, params: { p_id: PESSOA } });
    expect(Array.isArray(chamadas[0].params.p_nif_tokens)).toBe(true);
  });

  it('recusa devolvida pela RPC (NIF repetido): erro 409 com o codigo, nunca 200 nem o NIF', async () => {
    for (const codigo of ['NG030', 'NG031']) {
      const { chamar } = montar({ data: { erro: codigo, mensagem: 'Nao foi possivel gravar este NIF.' } });
      const r = await chamar({ rpc: 'neg_guardar_nif_pessoa', nif: NIF, params: { p_organization_id: ORG, p_entity_id: PESSOA } });
      expect(r.status).toBe(409);
      const corpo = await r.json();
      expect(corpo.error).toMatch(new RegExp(`^${codigo} `));
      expect('data' in corpo).toBe(false);
      expect(JSON.stringify(corpo)).not.toContain(NIF);
    }
  });

  it('erro lancado com codigo NG: o codigo vai a frente da mensagem (o ecra le-o do texto)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { chamar } = montar({ error: { message: 'Pessoa indisponivel.', code: 'NG003' } });
    const r = await chamar({ rpc: 'neg_guardar_nif_pessoa', nif: NIF, params: { p_organization_id: ORG, p_entity_id: PESSOA } });
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe('NG003 Pessoa indisponivel.');
  });

  it('erro da RPC que ecoe o NIF: o NIF nao chega ao cliente nem ao log', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { chamar } = montar({ error: { message: `invalido ${NIF}`, status: 400 } });
    const r = await chamar({ rpc: 'neg_guardar_nif_pessoa', nif: NIF, params: { p_organization_id: ORG, p_entity_id: PESSOA } });
    expect(r.status).toBe(400);
    expect(JSON.stringify(await r.json())).not.toContain(NIF);
    expect(log.mock.calls.map((c) => c.join(' ')).join('\n')).not.toContain(NIF);
  });
});

describe('nif-write-proxy: neg_guardar_nif_pessoa corre com service_role e o actor verificado', () => {
  const corpo = { rpc: 'neg_guardar_nif_pessoa', nif: NIF, params: { p_organization_id: ORG, p_entity_id: PESSOA } };

  it('chama a RPC com o cliente de servico e p_actor_auth_uid = utilizador do JWT validado', async () => {
    identidade.authUid = 'u-verificado';
    const { chamadas, chamar } = montar();
    const r = await chamar(corpo);
    expect(r.status).toBe(200);
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].cliente).toBe('servico');
    expect(chamadas[0].params.p_actor_auth_uid).toBe('u-verificado');
    expect(chamadas[0].params.p_organization_id).toBe(ORG);
    expect(chamadas[0].params.p_entity_id).toBe(PESSOA);
  });

  it('o cliente de servico nao leva o cabecalho de autorizacao do utilizador', async () => {
    const { chamadas, chamar } = montar();
    await chamar(corpo);
    expect(chamadas[0].cabecalho).toBeUndefined();
  });

  it('p_actor_auth_uid vindo do cliente e ignorado: prevalece o do JWT', async () => {
    identidade.authUid = 'u-verificado';
    const { chamadas, chamar } = montar();
    await chamar({ ...corpo, params: { ...corpo.params, p_actor_auth_uid: 'outro-utilizador', p_actor: 'x' } });
    expect(chamadas[0].params.p_actor_auth_uid).toBe('u-verificado');
    expect('p_actor' in chamadas[0].params).toBe(false);
  });

  it('NIF vazio (limpar) tambem leva o actor verificado', async () => {
    identidade.authUid = 'u-verificado';
    const { chamadas, chamar } = montar();
    await chamar({ ...corpo, nif: '' });
    expect(chamadas[0].cliente).toBe('servico');
    expect(chamadas[0].params.p_actor_auth_uid).toBe('u-verificado');
  });

  it('chamador com chave service_role ou segredo do cron: 403 e nunca chega a base', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    for (const uid of ['service_role', 'db_trigger']) {
      identidade.isServiceRole = true;
      identidade.authUid = uid;
      const { chamadas, chamar, clienteServicoCriado } = montar();
      const r = await chamar(corpo);
      expect(r.status).toBe(403);
      expect(chamadas).toHaveLength(0);
      expect(clienteServicoCriado).toHaveLength(0);
    }
  });

  it('sem JWT valido: 401, nao chama a RPC nem cria o cliente de servico', async () => {
    identidade.falha = true;
    const { chamadas, chamar, clienteServicoCriado } = montar();
    const r = await chamar(corpo);
    expect(r.status).toBe(401);
    expect(chamadas).toHaveLength(0);
    expect(clienteServicoCriado).toHaveLength(0);
  });

  it('as outras RPCs continuam a correr com o JWT do utilizador, e o p_actor_auth_uid do cliente e descartado', async () => {
    const { chamadas, chamar, clienteServicoCriado } = montar();
    await chamar({ rpc: 'rpc_update_client', nif: NIF, params: { p_id: PESSOA, p_actor_auth_uid: 'outro' } });
    expect(chamadas[0].cliente).toBe('utilizador');
    expect(chamadas[0].cabecalho).toBe('Bearer t');
    expect('p_actor_auth_uid' in chamadas[0].params).toBe(false);
    expect(clienteServicoCriado).toHaveLength(0);
  });

  it('42501 (sem permissao na base) devolve 403 sem o NIF', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { chamar } = montar({ error: { message: `Sem permissao ${NIF}`, code: '42501' } });
    const r = await chamar(corpo);
    expect(r.status).toBe(403);
    expect(JSON.stringify(await r.json())).not.toContain(NIF);
  });

  it('NG030/NG031 devolvidos (409) e NG032 lancado (429) mantem-se com o cliente de servico, sem NIF', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    for (const codigo of ['NG030', 'NG031']) {
      const { chamadas, chamar } = montar({ data: { erro: codigo, mensagem: `Repetido ${NIF}` } });
      const r = await chamar(corpo);
      expect(r.status).toBe(409);
      expect(chamadas[0].cliente).toBe('servico');
      expect(JSON.stringify(await r.json())).not.toContain(NIF);
    }
    const { chamar } = montar({ error: { message: `Demasiadas ${NIF}`, code: 'NG032' } });
    const r = await chamar(corpo);
    expect(r.status).toBe(429);
    const texto = JSON.stringify(await r.json());
    expect(texto).toContain('NG032');
    expect(texto).not.toContain(NIF);
  });

  it('o actor (uid) nao vai ao log de erro da RPC e a chave de servico nunca aparece', async () => {
    const SEGREDO = 'segredo-service-role-xyz';
    (globalThis as Record<string, unknown>).Deno = { env: { get: (k: string) => (k === 'SUPABASE_SERVICE_ROLE_KEY' ? SEGREDO : undefined) } };
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const { chamar } = montar({ error: { message: 'falhou', code: 'NG003' } });
      const r = await chamar(corpo);
      expect(JSON.stringify(await r.json())).not.toContain(SEGREDO);
      const texto = [...log.mock.calls, ...aviso.mock.calls].map((c) => c.join(' ')).join('\n');
      expect(texto).not.toContain(SEGREDO);
    } finally {
      (globalThis as Record<string, unknown>).Deno = { env: { get: () => undefined } };
    }
  });
});

describe('nif-write-proxy: limite de tentativas por utilizador', () => {
  const corpo = { rpc: 'neg_guardar_nif_pessoa', nif: NIF, params: { p_organization_id: ORG, p_entity_id: PESSOA } };

  it('o limite por omissao e 10 por minuto', () => {
    expect(NIF_RATE_LIMIT_MAX).toBe(10);
    expect(NIF_RATE_LIMIT_WINDOW_MS).toBe(60_000);
  });

  it('a tentativa seguinte ao limite devolve 429 e nao chega a RPC', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { chamadas, chamar } = montar();
    for (let i = 0; i < NIF_RATE_LIMIT_MAX; i++) expect((await chamar(corpo)).status).toBe(200);
    const r = await chamar(corpo);
    expect(r.status).toBe(429);
    expect(chamadas).toHaveLength(NIF_RATE_LIMIT_MAX);
  });

  it('o limite e por utilizador: outro utilizador nao e afetado', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { chamar } = montar();
    for (let i = 0; i <= NIF_RATE_LIMIT_MAX; i++) await chamar(corpo);
    identidade.authUid = 'u2';
    expect((await chamar(corpo)).status).toBe(200);
  });

  it('a janela desliza: passado um minuto volta a aceitar', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.useFakeTimers();
    const { chamar } = montar();
    for (let i = 0; i < NIF_RATE_LIMIT_MAX; i++) await chamar(corpo);
    expect((await chamar(corpo)).status).toBe(429);
    vi.advanceTimersByTime(NIF_RATE_LIMIT_WINDOW_MS + 1);
    expect((await chamar(corpo)).status).toBe(200);
  });

  it('o registo de seguranca identifica o utilizador mas nunca contem o NIF', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const erro = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { chamar } = montar();
    for (let i = 0; i <= NIF_RATE_LIMIT_MAX; i++) await chamar(corpo);
    const texto = [...aviso.mock.calls, ...erro.mock.calls].map((c) => c.join(' ')).join('\n');
    expect(texto).toContain('u1');
    expect(texto).not.toContain(NIF);
  });

  it('as chaves antigas saem do Map: quem nao volta nao fica guardado para sempre', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.useFakeTimers();
    const { chamar } = montar();
    await chamar(corpo);
    expect(nifRateLimitKeyCountForTests()).toBe(1);
    vi.advanceTimersByTime(NIF_RATE_LIMIT_WINDOW_MS + 1);
    identidade.authUid = 'u2';
    for (let i = 0; i < NIF_RATE_LIMIT_SWEEP_EVERY; i++) await chamar(corpo);
    expect(nifRateLimitKeyCountForTests()).toBe(1);
  });

  it('NG032 (limite da base, partilhado) devolve 429 com o codigo na mensagem e sem o NIF', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { chamar } = montar({ error: { message: 'Demasiadas tentativas de gravar o NIF.', code: 'NG032' } });
    const r = await chamar(corpo);
    expect(r.status).toBe(429);
    const texto = JSON.stringify(await r.json());
    expect(texto).toContain('NG032');
    expect(texto).not.toContain(NIF);
  });

  it('chamadas sem NIF a outras RPCs nao gastam o limite', async () => {
    const { chamar } = montar();
    for (let i = 0; i < NIF_RATE_LIMIT_MAX + 5; i++) {
      expect((await chamar({ rpc: 'rpc_update_user', params: { p_id: PESSOA } })).status).toBe(200);
    }
  });
});

describe('nif-write-proxy: redactNif', () => {
  it('cobre NIF com e sem separadores', () => {
    expect(redactNif('erro 123456789 x', '123456789')).toBe('erro *** x');
    expect(redactNif('erro 123 456 789 x', '123 456 789')).not.toContain('456');
    expect(redactNif('erro 123.456.789 x', '123.456.789')).not.toContain('456');
    expect(redactNif('erro 123-456-789 x', '123-456-789')).not.toContain('456');
    expect(redactNif('erro 123456789 x', '123-456-789')).not.toContain('123456789');
  });

  it('cobre ocorrencias repetidas e NIF vazio nao altera a mensagem', () => {
    expect(redactNif('123456789 e 123456789', '123456789')).toBe('*** e ***');
    expect(redactNif('sem nif', '')).toBe('sem nif');
  });

  it('o NIF com separadores digitado pelo cliente nao aparece em erro nem em log', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { chamar } = montar({ error: { message: 'invalido 123456789 / 123 456 789', status: 400 } });
    const r = await chamar({ rpc: 'neg_guardar_nif_pessoa', nif: '123 456 789', params: { p_organization_id: ORG, p_entity_id: PESSOA } });
    const texto = JSON.stringify(await r.json());
    expect(texto).not.toContain('123456789');
    expect(texto).not.toContain('123 456 789');
    expect(log.mock.calls.map((c) => c.join(' ')).join('\n')).not.toContain('123456789');
  });
});
