import { describe, expect, it, vi } from "vitest";
import {
  RECOMPUTE_BATCH_SIZE,
  runRecomputeBatches,
  type RecomputeBatchCaller,
  type RecomputeBatchRow,
} from "../workflow/recomputeBatches";

/**
 * O recálculo dos buckets deixou de ser uma chamada única (rebentava com
 * `statement timeout` aos 8s na Mudelar, 6120 leads) e passou a percorrer a
 * RPC por lotes. O que se cobre aqui é exactamente o ciclo que corre em
 * produção: os totais acumulados, as condições de paragem e — sobretudo — as
 * guardas que impedem o browser de chamar a RPC para sempre.
 */

/** Constrói uma linha da RPC com os campos que não interessam ao teste a zero. */
const row = (over: Partial<RecomputeBatchRow> = {}): RecomputeBatchRow => ({
  updated_count: 0,
  unresolved_count: 0,
  unresolved_lead_ids: [],
  processed_count: 0,
  last_id: null,
  ...over,
});

/** Responde com as linhas indicadas, pela ordem, tal como o Supabase (array). */
const callerFor = (rows: RecomputeBatchRow[]) => {
  const calls: Array<{ limit: number; after: string | null }> = [];
  const callBatch: RecomputeBatchCaller = async params => {
    calls.push(params);
    return { data: [rows[calls.length - 1]], error: null };
  };
  return { callBatch, calls };
};

describe("runRecomputeBatches", () => {
  it("soma os updated_count de vários lotes cheios até ao lote incompleto", async () => {
    const { callBatch, calls } = callerFor([
      row({ processed_count: 500, updated_count: 120, last_id: "a" }),
      row({ processed_count: 500, updated_count: 80, last_id: "b" }),
      row({ processed_count: 500, updated_count: 10, last_id: "c" }),
      row({ processed_count: 137, updated_count: 5, last_id: "d" }),
    ]);

    const result = await runRecomputeBatches(callBatch);

    expect(result.error).toBeNull();
    expect(calls).toHaveLength(4);
    expect(result.updatedCount).toBe(215);
    expect(result.processedCount).toBe(1637);
    expect(result.batches).toBe(4);
  });

  it("passa p_after = last_id do lote anterior e começa com null", async () => {
    const { callBatch, calls } = callerFor([
      row({ processed_count: 500, last_id: "lead-1" }),
      row({ processed_count: 500, last_id: "lead-2" }),
      row({ processed_count: 3, last_id: "lead-3" }),
    ]);

    await runRecomputeBatches(callBatch);

    expect(calls).toEqual([
      { limit: RECOMPUTE_BATCH_SIZE, after: null },
      { limit: RECOMPUTE_BATCH_SIZE, after: "lead-1" },
      { limit: RECOMPUTE_BATCH_SIZE, after: "lead-2" },
    ]);
  });

  it("um único lote incompleto faz uma só chamada", async () => {
    const { callBatch, calls } = callerFor([
      row({ processed_count: 42, updated_count: 7, last_id: "z" }),
    ]);

    const result = await runRecomputeBatches(callBatch);

    expect(calls).toHaveLength(1);
    expect(result.updatedCount).toBe(7);
    expect(result.error).toBeNull();
  });

  it("pára logo quando o lote vem com processed_count 0", async () => {
    const { callBatch, calls } = callerFor([row({ processed_count: 0, last_id: "z" })]);

    const result = await runRecomputeBatches(callBatch);

    expect(calls).toHaveLength(1);
    expect(result.processedCount).toBe(0);
    expect(result.error).toBeNull();
  });

  it("pára quando o servidor não devolve cursor, mesmo com o lote cheio", async () => {
    const { callBatch, calls } = callerFor([
      row({ processed_count: 500, updated_count: 9, last_id: null }),
    ]);

    const result = await runRecomputeBatches(callBatch);

    expect(calls).toHaveLength(1);
    expect(result.updatedCount).toBe(9);
    expect(result.error).toBeNull();
  });

  it("pára quando a RPC não devolve linha nenhuma", async () => {
    const callBatch = vi.fn(async () => ({ data: [], error: null }));

    const result = await runRecomputeBatches(callBatch);

    expect(callBatch).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ batches: 0, processedCount: 0, error: null });
  });

  it("acumula no máximo 50 unresolved_lead_ids no TOTAL, não por lote", async () => {
    // Três lotes com 50 ids cada: a query que vai buscar os nomes assume 50.
    const ids = (prefix: string) => Array.from({ length: 50 }, (_, i) => `${prefix}-${i}`);
    const { callBatch } = callerFor([
      row({ processed_count: 500, unresolved_count: 50, unresolved_lead_ids: ids("a"), last_id: "a" }),
      row({ processed_count: 500, unresolved_count: 50, unresolved_lead_ids: ids("b"), last_id: "b" }),
      row({ processed_count: 20, unresolved_count: 50, unresolved_lead_ids: ids("c"), last_id: "c" }),
    ]);

    const result = await runRecomputeBatches(callBatch);

    expect(result.unresolvedLeadIds).toHaveLength(50);
    expect(result.unresolvedLeadIds[0]).toBe("a-0");
    expect(result.unresolvedLeadIds[49]).toBe("a-49");
    // A contagem total continua a ser a real, não o que cabe na lista.
    expect(result.unresolvedCount).toBe(150);
  });

  it("junta ids de lotes diferentes enquanto houver espaço", async () => {
    const { callBatch } = callerFor([
      row({ processed_count: 500, unresolved_lead_ids: ["x", "y"], last_id: "a" }),
      row({ processed_count: 1, unresolved_lead_ids: ["z"], last_id: "b" }),
    ]);

    const result = await runRecomputeBatches(callBatch);

    expect(result.unresolvedLeadIds).toEqual(["x", "y", "z"]);
  });

  it("pára com erro se o last_id se repetir, em vez de ciclar", async () => {
    const callBatch = vi.fn(async () => ({
      data: [row({ processed_count: 500, updated_count: 3, last_id: "preso" })],
      error: null,
    }));

    const result = await runRecomputeBatches(callBatch);

    // Duas chamadas: a segunda é que revela que o cursor não avançou.
    expect(callBatch).toHaveBeenCalledTimes(2);
    expect(result.updatedCount).toBe(6);
    expect(result.error?.message).toContain("não avançou");
  });

  it("nunca ultrapassa o tecto de lotes, mesmo com o servidor a avançar sempre", async () => {
    let n = 0;
    const callBatch = vi.fn(async () => {
      n += 1;
      return { data: [row({ processed_count: 500, updated_count: 1, last_id: `id-${n}` })], error: null };
    });

    const result = await runRecomputeBatches(callBatch, { maxBatches: 5 });

    expect(callBatch).toHaveBeenCalledTimes(5);
    expect(result.batches).toBe(5);
    expect(result.error?.message).toContain("limite de 5 lotes");
  });

  it("um erro a meio devolve o trabalho já feito e propaga o erro", async () => {
    const calls: Array<string | null> = [];
    const callBatch: RecomputeBatchCaller = async ({ after }) => {
      calls.push(after);
      if (calls.length === 3) {
        return { data: null, error: { message: "canceling statement due to statement timeout" } };
      }
      return {
        data: [row({ processed_count: 500, updated_count: 100, last_id: `id-${calls.length}` })],
        error: null,
      };
    };

    const result = await runRecomputeBatches(callBatch);

    expect(calls).toHaveLength(3);
    // Os dois primeiros lotes já estão gravados na BD: têm de ser reportados.
    expect(result.updatedCount).toBe(200);
    expect(result.batches).toBe(2);
    expect(result.error?.message).toBe("canceling statement due to statement timeout");
  });

  it("um erro logo no primeiro lote não reporta trabalho nenhum", async () => {
    const callBatch = vi.fn(async () => ({ data: null, error: { message: "permission denied" } }));

    const result = await runRecomputeBatches(callBatch);

    expect(callBatch).toHaveBeenCalledTimes(1);
    expect(result.updatedCount).toBe(0);
    expect(result.batches).toBe(0);
    expect(result.error?.message).toBe("permission denied");
  });

  it("reporta o progresso no fim de cada lote, com os totais acumulados", async () => {
    const { callBatch } = callerFor([
      row({ processed_count: 500, updated_count: 10, last_id: "a" }),
      row({ processed_count: 500, updated_count: 20, last_id: "b" }),
      row({ processed_count: 50, updated_count: 1, last_id: "c" }),
    ]);
    const progress: number[] = [];

    await runRecomputeBatches(callBatch, { onProgress: totals => progress.push(totals.processedCount) });

    expect(progress).toEqual([500, 1000, 1050]);
  });

  it("respeita um batchSize configurado ao decidir se o lote está cheio", async () => {
    const { callBatch, calls } = callerFor([
      row({ processed_count: 10, updated_count: 1, last_id: "a" }),
      row({ processed_count: 4, updated_count: 1, last_id: "b" }),
    ]);

    const result = await runRecomputeBatches(callBatch, { batchSize: 10 });

    expect(calls.map(c => c.limit)).toEqual([10, 10]);
    expect(result.updatedCount).toBe(2);
  });
});
