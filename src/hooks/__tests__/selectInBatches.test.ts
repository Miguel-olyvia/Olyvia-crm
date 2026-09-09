import { describe, it, expect, vi } from 'vitest';
import { selectInBatches, selectInBatchesOrThrow } from '@/hooks/useEntityIdentity';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `id-${i}`);

describe('selectInBatches', () => {
  it('parte a lista em lotes em vez de mandar tudo num pedido so', async () => {
    const lotes: string[][] = [];
    await selectInBatches(ids(650), async (batch) => {
      lotes.push(batch);
      return { data: batch.map((id) => ({ id })) };
    });
    expect(lotes.length).toBeGreaterThan(1);
    expect(Math.max(...lotes.map((l) => l.length))).toBeLessThanOrEqual(200);
    expect(lotes.flat()).toHaveLength(650);
  });

  it('devolve tudo o que os lotes trouxeram', async () => {
    const r = await selectInBatches(ids(450), async (batch) => ({ data: batch.map((id) => ({ id })) }));
    expect(r).toHaveLength(450);
  });
});

describe('selectInBatchesOrThrow', () => {
  it('rebenta quando um lote falha, em vez de devolver uma lista curta', async () => {
    const run = vi.fn(async (batch: string[]) =>
      batch.includes('id-300')
        ? { data: null, error: { message: 'Bad Request' } }
        : { data: batch.map((id) => ({ id })), error: null });
    await expect(selectInBatchesOrThrow(ids(650), run)).rejects.toThrow('Bad Request');
  });

  it('sem erro, comporta-se como o selectInBatches', async () => {
    const r = await selectInBatchesOrThrow(ids(650), async (batch) => ({
      data: batch.map((id) => ({ id })), error: null,
    }));
    expect(r).toHaveLength(650);
  });
});
