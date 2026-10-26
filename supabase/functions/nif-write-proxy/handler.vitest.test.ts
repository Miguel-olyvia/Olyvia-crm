// nif-write-proxy (handler): neg_guardar_nif_pessoa na lista fechada, hash/cifra/tokens calculados aqui, NIF vazio limpa, NIF nunca em log nem em erro.
// Supabase simulado; nada toca na base.
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('npm:zod', async () => await import('zod'));
vi.mock('../_shared/auth.ts', () => ({
  resolveCallerIdentity: async () => ({ id: 'u1' }),
  authErrorResponse: () => new Response(null, { status: 401 }),
}));
vi.mock('../_shared/sentry.ts', () => ({ captureError: async () => undefined }));

import { ALLOWED_RPCS, handleNifWriteProxyRequest } from './handler.ts';

(globalThis as Record<string, unknown>).Deno = { env: { get: () => undefined } };

const NIF = '123456789';
const ORG = 'b6ffce4f-f630-4933-833a-008649757a33';
const PESSOA = 'aaaaaaaa-0000-4000-8000-000000000009';
const chave = () => crypto.getRandomValues(new Uint8Array(32));

function montar(rpcResult: { data?: unknown; error?: { message: string; status?: number } | null } = {}) {
  const chamadas: Array<{ rpc: string; params: Record<string, unknown> }> = [];
  const deps = {
    supabaseAdmin: {},
    createUserClient: () => ({
      rpc: async (rpc: string, params: Record<string, unknown>) => {
        chamadas.push({ rpc, params });
        return { data: rpcResult.data ?? { mudou: true }, error: rpcResult.error ?? null };
      },
    }),
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
  return { chamadas, chamar };
}

afterEach(() => { vi.restoreAllMocks(); });

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
    expect(Array.isArray(p.p_nif_tokens)).toBe(true);
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
      expect(p.p_nif_tokens).toBeNull();
      expect(p.p_nif ?? '').toBe('');
    }
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
