import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { CUSTOS_LOTE, juntarCustosMovimentos, valorStockPorArmazem } from "../custosStock";

beforeEach(() => rpc.mockReset());

describe("valorStockPorArmazem", () => {
  it("devolve o valor por armazém da RPC", async () => {
    rpc.mockResolvedValueOnce({ data: [{ warehouse_id: "w1", valor: "12.5" }, { warehouse_id: "w2", valor: null }], error: null });
    await expect(valorStockPorArmazem("org")).resolves.toEqual({ w1: 12.5, w2: 0 });
    expect(rpc).toHaveBeenCalledWith("inv_valor_stock_armazens", { p_org: "org" });
  });
  it("lança o erro da base (sem products.view_cost)", async () => {
    const erro = { code: "42501", message: "Sem permissão" };
    rpc.mockResolvedValueOnce({ data: null, error: erro });
    await expect(valorStockPorArmazem("org")).rejects.toBe(erro);
  });
});

describe("juntarCustosMovimentos", () => {
  it("junta o custo por id e deixa null o que a base não devolve", async () => {
    rpc.mockResolvedValueOnce({ data: [{ id: "a", unit_cost_at_time: "2.5" }], error: null });
    await expect(juntarCustosMovimentos([{ id: "a", q: 1 }, { id: "b", q: 2 }])).resolves.toEqual([
      { id: "a", q: 1, unit_cost_at_time: 2.5 },
      { id: "b", q: 2, unit_cost_at_time: null },
    ]);
    expect(rpc).toHaveBeenCalledWith("inv_custos_movimentos", { p_ids: ["a", "b"] });
  });
  it("pede em lotes", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    const linhas = Array.from({ length: CUSTOS_LOTE + 1 }, (_, i) => ({ id: String(i) }));
    await juntarCustosMovimentos(linhas);
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});
