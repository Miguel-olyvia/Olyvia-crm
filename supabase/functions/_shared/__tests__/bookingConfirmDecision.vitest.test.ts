import { describe, expect, it } from 'vitest';
import { applyClientConfirmation, decideConfirm } from '../bookingConfirmDecision';

const STAMP = '2026-10-01T10:00:00.000Z';

describe('decideConfirm', () => {
  it('cancelled: recusa, com ou sem confirmed_at', () => {
    expect(decideConfirm('cancelled', null)).toBe('refuse');
    expect(decideConfirm('cancelled', STAMP)).toBe('refuse');
  });
  it('scheduled e rescheduled sem confirmacao: passam a confirmed', () => {
    expect(decideConfirm('scheduled', null)).toBe('confirm_and_set_status');
    expect(decideConfirm('rescheduled', null)).toBe('confirm_and_set_status');
  });
  it('draft, in_progress, completed e confirmed manual sem confirmacao: so carimbam', () => {
    for (const s of ['draft', 'in_progress', 'completed', 'confirmed']) {
      expect(decideConfirm(s, null)).toBe('stamp_only');
    }
  });
  it('ja confirmada pelo cliente: nada a fazer, em qualquer estado activo', () => {
    for (const s of ['draft', 'scheduled', 'confirmed', 'in_progress', 'completed', 'rescheduled']) {
      expect(decideConfirm(s, STAMP)).toBe('noop');
    }
  });
});

interface Call {
  patch?: Record<string, unknown>;
  filters: Array<[string, string, unknown]>;
  selected: boolean;
}

/** Simula schedule_items: o UPDATE com .in so acerta se casMatches; aplica o patch na linha. */
function fakeSupabase(
  row: { id: string; status: string; confirmed_at: string | null },
  opts: { casMatches?: boolean; failOn?: number } = {},
) {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      expect(table).toBe('schedule_items');
      const call: Call = { filters: [], selected: false };
      calls.push(call);
      const callIndex = calls.length;
      const builder: Record<string, unknown> = {
        update(patch: Record<string, unknown>) { call.patch = patch; return builder; },
        eq(c: string, v: unknown) { call.filters.push(['eq', c, v]); return builder; },
        neq(c: string, v: unknown) { call.filters.push(['neq', c, v]); return builder; },
        in(c: string, v: unknown) { call.filters.push(['in', c, v]); return builder; },
        is(c: string, v: unknown) { call.filters.push(['is', c, v]); return builder; },
        select() { call.selected = true; return builder; },
        then(resolve: (v: unknown) => unknown) {
          if (opts.failOn === callIndex) return resolve({ data: null, error: { message: 'boom' } });
          const hasIn = call.filters.some(f => f[0] === 'in');
          const matched = hasIn ? (opts.casMatches ?? true) : true;
          if (matched && call.patch) Object.assign(row, call.patch);
          const data = hasIn && call.selected ? (matched ? [{ id: row.id }] : []) : null;
          return resolve({ data, error: null });
        },
      };
      return builder;
    },
  };
  return { client, calls };
}

describe('applyClientConfirmation', () => {
  it('scheduled: um so UPDATE com status confirmed + confirmed_at, compare-and-swap', async () => {
    const row = { id: 'v1', status: 'scheduled', confirmed_at: null };
    const { client, calls } = fakeSupabase(row);
    const r = await applyClientConfirmation(client, row, STAMP);
    expect(r.error).toBeNull();
    expect(calls).toHaveLength(1);
    expect(calls[0].patch).toEqual({ status: 'confirmed', confirmed_at: STAMP });
    expect(calls[0].filters).toContainEqual(['in', 'status', ['scheduled', 'rescheduled']]);
    expect(calls[0].filters).toContainEqual(['is', 'confirmed_at', null]);
    expect(calls[0].selected).toBe(true);
  });
  it('rescheduled tambem passa a confirmed', async () => {
    const row = { id: 'v1', status: 'rescheduled', confirmed_at: null };
    const { client, calls } = fakeSupabase(row);
    await applyClientConfirmation(client, row, STAMP);
    expect(row.status).toBe('confirmed');
    expect(calls[0].patch).toEqual({ status: 'confirmed', confirmed_at: STAMP });
  });
  it('compare-and-swap com 0 linhas: cai no carimbo simples, sem mexer no estado', async () => {
    const row = { id: 'v1', status: 'scheduled', confirmed_at: null };
    const { client, calls } = fakeSupabase(row, { casMatches: false });
    const r = await applyClientConfirmation(client, row, STAMP);
    expect(r.error).toBeNull();
    expect(calls).toHaveLength(2);
    expect(calls[1].patch).toEqual({ confirmed_at: STAMP });
    expect(calls[1].filters).toContainEqual(['is', 'confirmed_at', null]);
    expect(calls[1].filters).toContainEqual(['neq', 'status', 'cancelled']);
    expect(row.status).toBe('scheduled');
  });
  it('in_progress: so carimba, o estado nao muda', async () => {
    const row = { id: 'v1', status: 'in_progress', confirmed_at: null };
    const { client, calls } = fakeSupabase(row);
    await applyClientConfirmation(client, row, STAMP);
    expect(calls).toHaveLength(1);
    expect(calls[0].patch).toEqual({ confirmed_at: STAMP });
    expect(row.status).toBe('in_progress');
  });
  it('ja confirmada: nao escreve nada (idempotente)', async () => {
    const row = { id: 'v1', status: 'scheduled', confirmed_at: STAMP };
    const { client, calls } = fakeSupabase(row);
    const r = await applyClientConfirmation(client, row, '2026-10-02T00:00:00.000Z');
    expect(r.error).toBeNull();
    expect(calls).toHaveLength(0);
  });
  it('erro da base devolve o erro', async () => {
    const row = { id: 'v1', status: 'scheduled', confirmed_at: null };
    const { client } = fakeSupabase(row, { failOn: 1 });
    const r = await applyClientConfirmation(client, row, STAMP);
    expect(r.error?.message).toBe('boom');
  });
});
