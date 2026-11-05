import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { gravarDefinicoesImportadas } from "../inventario/definicoesImportacao";

beforeEach(() => rpc.mockReset());

describe("gravarDefinicoesImportadas", () => {
  it("grava só as quatro definições pela RPC (nunca a quantidade)", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(
      gravarDefinicoesImportadas("s1", { minimum_quantity: 1, maximum_quantity: 10, reorder_point: 2, location: "A1" }),
    ).resolves.toBeNull();
    expect(rpc).toHaveBeenCalledWith("rpc_stock_import_settings", {
      p_stock_id: "s1",
      p_minimum_quantity: 1,
      p_maximum_quantity: 10,
      p_reorder_point: 2,
      p_location: "A1",
    });
    const args = rpc.mock.calls[0][1] as Record<string, unknown>;
    expect(Object.keys(args).some((k) => /quantity$/.test(k) && !/(minimum|maximum)_quantity$/.test(k))).toBe(false);
  });

  it("devolve o erro da base (ex.: organização sem inventory.import nem inventory.edit)", async () => {
    const erro = { code: "42501", message: "Sem permissão para alterar as definições de stock desta organização" };
    rpc.mockResolvedValueOnce({ data: null, error: erro });
    await expect(
      gravarDefinicoesImportadas("s2", { minimum_quantity: 0, maximum_quantity: 0, reorder_point: 0, location: null }),
    ).resolves.toBe(erro);
  });
});
