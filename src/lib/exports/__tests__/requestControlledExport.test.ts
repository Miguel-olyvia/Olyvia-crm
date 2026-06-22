import { describe, expect, it, vi } from "vitest";

import { requestControlledExport } from "../requestControlledExport";

describe("requestControlledExport", () => {
  it("envia apenas módulo, organização, opção sensível e filtros", async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: {
        filename: "clientes_2026-06-22.xlsx",
        sheetName: "Clientes",
        columns: [{ key: "name", header: "Nome", width: 30 }],
        rows: [{ name: "Cliente A" }],
        rowCount: 1,
        includesSensitive: false,
      },
      error: null,
    });
    const download = vi.fn();

    const result = await requestControlledExport({
      client: { functions: { invoke } } as any,
      module: "clients",
      organizationId: "5d5fd457-e4b0-4d6a-b8e6-267d721b171a",
      includeSensitive: false,
      filters: { status: "active" },
      download,
    });

    expect(invoke).toHaveBeenCalledWith("export-data", {
      body: {
        module: "clients",
        organizationId: "5d5fd457-e4b0-4d6a-b8e6-267d721b171a",
        includeSensitive: false,
        filters: { status: "active" },
      },
    });
    expect(JSON.stringify(invoke.mock.calls[0])).not.toContain("userId");
    expect(download).toHaveBeenCalledWith(
      {
        sheetName: "Clientes",
        columns: [{ key: "name", header: "Nome", width: 30 }],
        rows: [{ name: "Cliente A" }],
      },
      "clientes_2026-06-22.xlsx",
    );
    expect(result.rowCount).toBe(1);
  });

  it("falha quando a Edge Function devolve erro", async () => {
    const client = {
      functions: {
        invoke: vi.fn().mockResolvedValue({
          data: null,
          error: { message: "Edge Function returned a non-2xx status code" },
        }),
      },
    };

    await expect(
      requestControlledExport({
        client: client as any,
        module: "contacts",
        organizationId: "5d5fd457-e4b0-4d6a-b8e6-267d721b171a",
      }),
    ).rejects.toThrow("Não foi possível exportar os dados");
  });
});
