// insert-lead (handler): corpo invalido, resposta sem eco do schema e registos sem email nem telefone.
// O handler corre dentro de Deno.serve: aqui Deno e os imports remotos (esm.sh, npm:) estao simulados.
// Supabase simulado; nada toca na base.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('https://esm.sh/@supabase/supabase-js@2.80.0', () => ({ createClient: () => estado.client }));
vi.mock('npm:zod', async () => await import('zod'));
vi.mock('../_shared/sentry.ts', () => ({ initSentry: () => undefined, captureError: (...a: unknown[]) => estado.captureError(...a) }));
vi.mock('../_shared/rateLimit.ts', () => ({
  checkRateLimit: async () => ({ allowed: true }),
  recordRateLimitAttempt: async () => undefined,
  rateLimitResponse: () => new Response(null, { status: 429 }),
}));

vi.mock('../_shared/formCaptacao.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../_shared/formCaptacao.ts')>()),
  captarEnvio: (...a: unknown[]) => estado.captarEnvio(...a),
}));

const estado = vi.hoisted(() => ({
  captarEnvio: vi.fn(),
  client: null as unknown,
  captureError: vi.fn(async () => undefined),
}));

const ORG = 'aaaaaaaa-0000-4000-8000-000000000001';

function clienteSimulado() {
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'update', 'is', 'in', 'maybeSingle', 'order']) builder[m] = () => builder;
  builder.single = () => Promise.resolve({ data: { id: 'tok', organization_id: ORG, is_active: true, usage_count: 0 }, error: null });
  builder.then = (r: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(r);
  return {
    from: () => builder,
    rpc: (nome: string) => Promise.resolve(
      nome === 'fn_form_resolver_captacao'
        ? { data: [{ organization_id: ORG, form_id: null, campaign_id: null }], error: null }
        : { data: null, error: { message: 'rpc nao simulado' } },
    ),
  };
}

let handler: (req: Request) => Promise<Response>;

beforeEach(async () => {
  estado.client = clienteSimulado();
  estado.captureError.mockClear();
  estado.captarEnvio.mockReset().mockResolvedValue({ ok: true, submissionId: 'sub-1', entityId: 'ent-1', created: false });
  vi.stubEnv('NIF_HMAC_KEY', 'A'.repeat(43) + '=');
  (globalThis as Record<string, unknown>).Deno = {
    serve: (h: (req: Request) => Promise<Response>) => { handler = h; },
    env: { get: (k: string) => (k === 'NIF_HMAC_KEY' ? 'A'.repeat(43) + '=' : 'valor-de-teste') },
  };
  vi.resetModules();
  await import('./index.ts');
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

const pedido = (corpo: BodyInit) =>
  new Request('http://localhost/insert-lead', { method: 'POST', headers: { 'x-api-key': 'k', 'content-type': 'application/json' }, body: corpo });

describe('insert-lead: pedido invalido', () => {
  it('JSON invalido devolve 400 generico (nunca 500) e nao chama o Sentry', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const r = await handler(pedido('{isto nao e json'));
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: 'Invalid request' });
    expect(estado.captureError).not.toHaveBeenCalled();
  });

  it('corpo que o schema recusa devolve 400 sem details nem issues', async () => {
    const r = await handler(pedido(JSON.stringify({ first_name: 123 })));
    expect(r.status).toBe(400);
    const corpo = await r.json();
    expect(corpo).toEqual({ error: 'Invalid request' });
    expect(JSON.stringify(corpo)).not.toMatch(/issues|details|first_name/);
  });
});

describe('insert-lead: registos sem dados do visitante', () => {
  it('telefone rejeitado: o log diz que houve rejeicao mas nunca o valor', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const telefone = 'telefone-secreto-xyz';
    // (O zod recusa de entrada os emails que o sanitizador recusaria, por isso aqui so o telefone chega ao registo.)
    await handler(pedido(JSON.stringify({ first_name: 'Ana', last_name: 'Silva', phone: telefone })));
    const texto = aviso.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(texto).toContain('[insert-lead] telefone rejeitado por invalido');
    expect(texto).not.toContain(telefone);
    expect(texto).not.toContain('secreto');
  });
});

describe('insert-lead: resposta igual para pessoa nova e conhecida', () => {
  it('sucesso nao devolve entity_id nem created', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const r = await handler(pedido(JSON.stringify({ first_name: 'Ana', last_name: 'Silva', email: 'ana@exemplo.pt' })));
    expect(r.status).toBe(201);
    const corpo = await r.json();
    expect(corpo.lead_id).toBe('sub-1');
    expect(corpo).not.toHaveProperty('entity_id');
    expect(corpo).not.toHaveProperty('created');
    expect(JSON.stringify(corpo)).not.toContain('ent-1');
  });

  it('honeypot tambem nao devolve entity_id', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const r = await handler(pedido(JSON.stringify({ first_name: 'Bot', website: 'http://spam' })));
    const corpo = await r.json();
    expect(corpo).not.toHaveProperty('entity_id');
  });
});
