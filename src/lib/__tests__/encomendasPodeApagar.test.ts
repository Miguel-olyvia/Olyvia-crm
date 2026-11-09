import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { encomendasQuePodeApagar, PODE_APAGAR_LOTE } from "../inventario/encomendasPodeApagar";

beforeEach(() => rpc.mockReset());

describe("encomendasQuePodeApagar", () => {
  it("devolve os ids que o servidor aceita (rpc_client_orders_can_delete)", async () => {
    rpc.mockResolvedValueOnce({ data: ["a"], error: null });
    await expect(encomendasQuePodeApagar(["a", "b", "a"])).resolves.toEqual(new Set(["a"]));
    expect(rpc).toHaveBeenCalledWith("rpc_client_orders_can_delete", { p_contract_ids: ["a", "b"] });
  });

  it("pede em lotes", async () => {
    const ids = Array.from({ length: PODE_APAGAR_LOTE + 3 }, (_, i) => `id${i}`);
    rpc.mockResolvedValueOnce({ data: ["id0"], error: null }).mockResolvedValueOnce({ data: [`id${PODE_APAGAR_LOTE + 2}`], error: null });
    const out = await encomendasQuePodeApagar(ids);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(out).toEqual(new Set(["id0", `id${PODE_APAGAR_LOTE + 2}`]));
  });

  it("em erro fica vazio (o botão não promete o que o servidor recusa)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockResolvedValueOnce({ data: null, error: { message: "falhou" } });
    await expect(encomendasQuePodeApagar(["a"])).resolves.toEqual(new Set());
    spy.mockRestore();
  });

  it("sem ids não chama o servidor", async () => {
    await expect(encomendasQuePodeApagar([])).resolves.toEqual(new Set());
    expect(rpc).not.toHaveBeenCalled();
  });
});
