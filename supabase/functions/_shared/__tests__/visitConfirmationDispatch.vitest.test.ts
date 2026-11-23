import { describe, expect, it, vi } from 'vitest';
import { dispatchVisitConfirmations } from '../visitConfirmationDispatch';

const NOW = new Date('2026-11-23T10:00:00.000Z');
const URL = 'https://x.supabase.co/functions/v1/send-visit-confirmation';

function dueDb(result: { data?: unknown; error?: unknown }) {
  const calls: Record<string, unknown[]> = {};
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'or', 'limit']) {
    b[m] = (...a: unknown[]) => { calls[m] = a; return b; };
  }
  b.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: result.data ?? null, error: result.error ?? null }).then(ok);
  return { db: { from: vi.fn(() => b) }, calls };
}

const okResponse = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;

describe('dispatchVisitConfirmations', () => {
  it('sem linhas vencidas nao chama a funcao', async () => {
    const { db } = dueDb({ data: [] });
    const fetchFn = vi.fn();
    const out = await dispatchVisitConfirmations({ supabase: db, url: URL, authorization: 'Bearer s', fetchFn, now: () => NOW });
    expect(out).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('a pergunta apanha pending vencidas E sending caducadas (o ultimo caso e o da linha presa)', async () => {
    const { db, calls } = dueDb({ data: [] });
    await dispatchVisitConfirmations({ supabase: db, url: URL, authorization: 'Bearer s', fetchFn: vi.fn(), now: () => NOW });
    expect(db.from).toHaveBeenCalledWith('visit_confirmation_sends');
    const filter = String(calls.or[0]);
    expect(filter).toContain('and(status.eq.pending,next_attempt_at.lte.2026-11-23T10:00:00.000Z)');
    // 10 minutos antes de agora: o mesmo limiar da limpeza em fn_visit_confirmation_claim
    expect(filter).toContain('and(status.eq.sending,claimed_at.lt.2026-11-23T09:50:00.000Z)');
  });

  it('sem waitUntil espera pela funcao e devolve o resumo, com a mesma credencial', async () => {
    const { db } = dueDb({ data: [{ id: 'q1' }] });
    const fetchFn = vi.fn(async () => okResponse({ processed: 3 }));
    const out = await dispatchVisitConfirmations({ supabase: db, url: URL, authorization: 'Bearer cron', fetchFn, now: () => NOW });
    expect(out).toEqual({ processed: 3 });
    const [calledUrl, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(calledUrl).toBe(URL);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer cron');
    expect(init.body).toBe('{}');
  });

  it('com waitUntil devolve logo, sem esperar pela funcao (nao atrasa o lote de lembretes)', async () => {
    const { db } = dueDb({ data: [{ id: 'q1' }] });
    let release: (r: Response) => void = () => {};
    const slow = new Promise<Response>((res) => { release = res; });
    const fetchFn = vi.fn(() => slow);
    const registered: Promise<unknown>[] = [];
    const out = await dispatchVisitConfirmations({
      supabase: db, url: URL, authorization: 'Bearer s', fetchFn, now: () => NOW,
      waitUntil: (p) => { registered.push(p); },
    });
    expect(out).toBe('scheduled');
    expect(registered).toHaveLength(1);
    release(okResponse({ processed: 1 }));
    await expect(registered[0]).resolves.toBeUndefined();
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('fail-soft: erro de rede ou tabela em falta nunca lanca (nem a promessa entregue ao waitUntil rejeita)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const boom = vi.fn(async () => { throw new Error('rede'); });
    const a = dueDb({ data: [{ id: 'q1' }] });
    expect(await dispatchVisitConfirmations({ supabase: a.db, url: URL, authorization: 'x', fetchFn: boom, now: () => NOW })).toBeNull();

    const registered: Promise<unknown>[] = [];
    const b = dueDb({ data: [{ id: 'q1' }] });
    await dispatchVisitConfirmations({ supabase: b.db, url: URL, authorization: 'x', fetchFn: boom, now: () => NOW, waitUntil: (p) => { registered.push(p); } });
    await expect(registered[0]).resolves.toBeUndefined();

    const c = dueDb({ error: { message: 'relation does not exist' } });
    const fetchFn = vi.fn();
    expect(await dispatchVisitConfirmations({ supabase: c.db, url: URL, authorization: 'x', fetchFn, now: () => NOW })).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
