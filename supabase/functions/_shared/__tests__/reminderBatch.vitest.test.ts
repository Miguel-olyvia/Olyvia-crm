import { describe, expect, it, vi } from 'vitest';
import { collectDueBatch, decideRendered, isHeldBack } from '../reminderBatch';

interface R { id: string; schedule_item_id: string | null; scheduled_for: number }

/** Base simulada: linhas pendentes, mais antigas primeiro, limite por pagina, exclusao por id. */
function fakeDue(rows: R[], pageSize = 50) {
  const pending = new Set(rows.map((r) => r.id));
  const calls: string[][] = [];
  return {
    pending,
    calls,
    fetchDue: async (exclude: readonly string[]) => {
      calls.push([...exclude]);
      return rows
        .filter((r) => pending.has(r.id) && !exclude.includes(r.id))
        .sort((a, b) => a.scheduled_for - b.scheduled_for || a.id.localeCompare(b.id))
        .slice(0, pageSize);
    },
  };
}

const row = (n: number, item: string | null = `item-${n}`): R => ({ id: `r-${String(n).padStart(3, '0')}`, schedule_item_id: item, scheduled_for: n });

describe('isHeldBack', () => {
  it('so segura linhas de visitas por acertar', () => {
    const un = new Set(['i1']);
    expect(isHeldBack({ id: 'a', schedule_item_id: 'i1' }, un)).toBe(true);
    expect(isHeldBack({ id: 'a', schedule_item_id: 'i2' }, un)).toBe(false);
    expect(isHeldBack({ id: 'a', schedule_item_id: null }, un)).toBe(false);
  });
});

describe('decideRendered', () => {
  it('adiar, cancelar, enviar o conteudo novo ou o guardado', () => {
    expect(decideRendered({ kind: 'defer', reason: 'x' })).toEqual({ kind: 'defer', reason: 'x' });
    expect(decideRendered({ kind: 'cancel', reason: 'y' })).toEqual({ kind: 'cancel', reason: 'y' });
    expect(decideRendered({ kind: 'ok', value: 'texto' })).toEqual({ kind: 'send', content: 'texto' });
    expect(decideRendered({ kind: 'stored' })).toEqual({ kind: 'send', content: null });
  });
});

describe('collectDueBatch', () => {
  it('sem visitas ligadas: nao acerta nada e devolve as linhas por ordem', async () => {
    const db = fakeDue([row(3, null), row(1, null), row(2, null)]);
    const reconcile = vi.fn(async () => new Set<string>());
    const out = await collectDueBatch({ fetchDue: db.fetchDue, reconcile });
    expect(reconcile).not.toHaveBeenCalled();
    expect(out.rows.map((r) => r.id)).toEqual(['r-001', 'r-002', 'r-003']);
    expect(out.deferred).toBe(0);
  });

  it('as linhas de uma visita que falhou ao acertar nao entram e contam como adiadas', async () => {
    const db = fakeDue([row(1), row(2), row(3, null)]);
    const out = await collectDueBatch({
      fetchDue: db.fetchDue,
      reconcile: async () => new Set(['item-1']),
    });
    expect(out.rows.map((r) => r.id)).toEqual(['r-002', 'r-003']);
    expect(out.deferred).toBe(1);
    expect([...out.unreconciled]).toEqual(['item-1']);
  });

  it('60 linhas adiadas nao impedem as outras de sair (o lote nao fica ocupado)', async () => {
    const held = Array.from({ length: 60 }, (_, i) => row(i + 1, 'item-preso'));
    const ok = [row(100, null), row(101, null), row(102, 'item-bom')];
    const db = fakeDue([...held, ...ok]);
    const out = await collectDueBatch({
      fetchDue: db.fetchDue,
      reconcile: async (ids) => new Set(ids.filter((i) => i === 'item-preso')),
    });
    expect(out.rows.map((r) => r.id)).toEqual(['r-100', 'r-101', 'r-102']);
    expect(out.deferred).toBe(60);
  });

  it('cada visita so e acertada uma vez por corrida', async () => {
    const rows = Array.from({ length: 70 }, (_, i) => row(i + 1, 'item-unico'));
    const db = fakeDue(rows);
    const reconcile = vi.fn(async () => new Set<string>());
    const out = await collectDueBatch({ fetchDue: db.fetchDue, reconcile });
    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(out.rows).toHaveLength(50);
  });

  it('nunca devolve mais do que o tamanho do lote, e as mais antigas primeiro', async () => {
    const db = fakeDue(Array.from({ length: 120 }, (_, i) => row(120 - i, null)));
    const out = await collectDueBatch({ fetchDue: db.fetchDue, reconcile: async () => new Set() });
    expect(out.rows).toHaveLength(50);
    expect(out.rows[0].id).toBe('r-001');
    expect(out.rows[49].id).toBe('r-050');
  });

  it('as paginas seguintes excluem o que ja foi visto e param nas passagens maximas', async () => {
    const held = Array.from({ length: 500 }, (_, i) => row(i + 1, 'item-preso'));
    const db = fakeDue(held);
    const out = await collectDueBatch({
      fetchDue: db.fetchDue,
      reconcile: async () => new Set(['item-preso']),
    });
    expect(out.rows).toHaveLength(0);
    expect(out.deferred).toBe(150);
    // a 2a passagem ja exclui as 50 da 1a
    expect(db.calls.some((c) => c.length === 50)).toBe(true);
    expect(Math.max(...db.calls.map((c) => c.length))).toBeLessThanOrEqual(100);
  });

  it('uma linha cancelada pelo proprio acerto deixa de contar', async () => {
    const db = fakeDue([row(1), row(2, null)]);
    const out = await collectDueBatch({
      fetchDue: db.fetchDue,
      reconcile: async () => { db.pending.delete('r-001'); return new Set<string>(); },
    });
    expect(out.rows.map((r) => r.id)).toEqual(['r-002']);
  });

  it('um erro de leitura propaga-se (nao se trata como lote vazio)', async () => {
    await expect(collectDueBatch({
      fetchDue: async () => { throw new Error('boom'); },
      reconcile: async () => new Set(),
    })).rejects.toThrow('boom');
  });
});
