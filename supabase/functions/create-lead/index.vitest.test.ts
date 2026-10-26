// create-lead (handler): o hash do NIF reutiliza a chave HMAC ja derivada e uma falha vai ao Sentry em vez de ser engolida.
// O handler corre dentro de Deno.serve: aqui Deno e os imports remotos (esm.sh, npm:) estao simulados.
// Supabase simulado; nada toca na base.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const estado = vi.hoisted(() => ({
  client: null as unknown,
  captureError: vi.fn(async () => undefined),
  deriveKey: vi.fn(),
  hashNif: vi.fn(),
  captarEnvio: vi.fn(),
  verificarCamposUnicos: vi.fn(),
}));

vi.mock('https://esm.sh/@supabase/supabase-js@2.80.0', () => ({ createClient: () => estado.client }));
vi.mock('npm:zod', async () => await import('zod'));
vi.mock('../_shared/sentry.ts', () => ({ initSentry: () => undefined, captureError: (...a: unknown[]) => estado.captureError(...a) }));
vi.mock('../_shared/rateLimit.ts', () => ({
  checkRateLimit: async () => ({ allowed: true }),
  recordRateLimitAttempt: async () => undefined,
  rateLimitResponse: () => new Response(null, { status: 429 }),
  getClientIp: () => '203.0.113.9',
}));
vi.mock('../_shared/nifCrypto.ts', () => ({
  deriveKeyFromEnv: (...a: unknown[]) => estado.deriveKey(...a),
  hashNif: (...a: unknown[]) => estado.hashNif(...a),
}));
vi.mock('../_shared/formCaptacao.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../_shared/formCaptacao.ts')>()),
  captarEnvio: (...a: unknown[]) => estado.captarEnvio(...a),
  verificarCamposUnicos: (...a: unknown[]) => estado.verificarCamposUnicos(...a),
}));

const ORG = 'aaaaaaaa-0000-4000-8000-000000000001';
const CAMP = 'cccccccc-0000-4000-8000-000000000004';
const CHAVE = new Uint8Array([1, 2, 3, 4]);

function clienteSimulado() {
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is', 'in', 'order', 'limit', 'maybeSingle', 'single', 'update']) builder[m] = () => builder;
  builder.then = (r: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(r);
  return {
    from: () => builder,
    rpc: (nome: string) => Promise.resolve(
      nome === 'fn_form_resolver_captacao'
        ? { data: [{ organization_id: ORG, form_id: null, campaign_id: CAMP }], error: null }
        : { data: null, error: { message: 'rpc nao simulado' } },
    ),
  };
}

let handler: (req: Request) => Promise<Response>;

beforeEach(async () => {
  estado.client = clienteSimulado();
  estado.captureError.mockClear();
  estado.deriveKey.mockReset().mockReturnValue(CHAVE);
  estado.hashNif.mockReset().mockResolvedValue('hash-do-nif');
  estado.verificarCamposUnicos.mockReset().mockResolvedValue(null);
  estado.captarEnvio.mockReset().mockResolvedValue({ ok: false, status: 503, error: 'fim do teste', code: 'RETRY' });
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  (globalThis as Record<string, unknown>).Deno = {
    serve: (h: (req: Request) => Promise<Response>) => { handler = h; },
    env: { get: () => 'valor-de-teste' },
  };
  vi.resetModules();
  await import('./index.ts');
});
afterEach(() => { vi.restoreAllMocks(); });

const pedido = () => new Request('http://localhost/create-lead', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    campaign_id: CAMP,
    field_values: { nome: 'Ana', apelido: 'Silva', email: 'ana@exemplo.pt', telefone: '912345678', nif: '123456789' },
  }),
});

describe('create-lead: hash do NIF', () => {
  it('reutiliza a chave ja derivada para a impressao digital: deriveKeyFromEnv corre uma so vez e hashNif recebe essa chave', async () => {
    await handler(pedido());
    expect(estado.deriveKey).toHaveBeenCalledTimes(1);
    expect(estado.hashNif).toHaveBeenCalledTimes(1);
    expect(estado.hashNif.mock.calls[0][1]).toBe(CHAVE);
    expect((estado.captarEnvio.mock.calls[0][0] as { nifHash: string | null }).nifHash).toBe('hash-do-nif');
  });

  it('hashNif a falhar: regista no Sentry (stage nif_hash, sem o NIF) e o envio segue sem hash', async () => {
    estado.hashNif.mockRejectedValue(new Error('hash rebentou'));
    await handler(pedido());
    const chamadas = estado.captureError.mock.calls as unknown as Array<[unknown, Record<string, unknown>]>;
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0][1]).toMatchObject({ function: 'create-lead', stage: 'nif_hash' });
    expect(JSON.stringify(chamadas[0][1])).not.toContain('123456789');
    expect((estado.captarEnvio.mock.calls[0][0] as { nifHash: string | null }).nifHash).toBeNull();
  });
});

describe('create-lead: a submissao entra sempre, sem aviso de duplicado', () => {
  it('mesmo com um valor unico ja usado: nao devolve 409 nem duplicate_*, e grava (captarEnvio corre)', async () => {
    estado.verificarCamposUnicos.mockResolvedValue({ fieldKey: 'email', fieldLabel: 'Email', value: 'ana@exemplo.pt' });
    const r = await handler(pedido());
    const corpo = JSON.stringify(await r.json());
    expect(r.status).not.toBe(409);
    expect(corpo).not.toMatch(/duplicate_field|duplicate_value|already exists/);
    expect(estado.verificarCamposUnicos).not.toHaveBeenCalled();
    expect(estado.captarEnvio).toHaveBeenCalledTimes(1);
  });
});
