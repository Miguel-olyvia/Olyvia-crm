import { describe, it, expect, vi, beforeEach } from "vitest";

const rpcMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
}));
vi.mock("@/contexts/CompanyContext", () => ({
  useCompany: () => ({ activeCompany: { id: "org-1" } }),
}));
const captureFlowErrorMock = vi.fn();
vi.mock("@/lib/observability/captureFlowError", () => ({
  captureFlowError: (...args: unknown[]) => captureFlowErrorMock(...args),
}));

import {
  fetchInventoryToday,
  getInventoryQueueItems,
  getInventoryQueueTotal,
  getInventoryCounter,
  type InventoryTodayPayload,
} from "@/hooks/useInventoryToday";
import { menuSections } from "@/components/sidebar/menuConfig";

const all = () => true;

const payload: InventoryTodayPayload = {
  purchases: {
    pending_approval: 3,
    late: 1,
    portal_unseen: 2,
    portal_confirmed: 0,
    open_delivery_notes: 4,
    delivery_notes_with_divergences: 0,
  },
  suppliers: { price_changes_pending: null, awaiting_profile: 2, catalog_unlinked: 5 },
  client_orders: {
    open: 7,
    ready_to_ship: 2,
    without_preferred_supplier: null,
    by_origin: { contract: 4, direct_sale: 2, manual: 1 },
  },
  stock: { below_reorder_point: 6, overstock: 1, reserved_units: 30, value: null },
  counts: { in_progress: 1, stalled: 0 },
  settings: { stock_deduction_trigger: "contract_signed" },
};

describe("fetchInventoryToday", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    captureFlowErrorMock.mockReset();
  });

  it("chama a RPC com a organização ativa", async () => {
    rpcMock.mockResolvedValue({ data: payload, error: null });
    await expect(fetchInventoryToday("org-1")).resolves.toEqual(payload);
    expect(rpcMock).toHaveBeenCalledWith("rpc_inventory_today", { p_organization_id: "org-1" });
  });

  it("devolve null em silêncio quando a função ainda não existe (PGRST202 / 404)", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { code: "PGRST202", message: "not found" }, status: 404 });
    expect(await fetchInventoryToday("org-1")).toBeNull();
    rpcMock.mockResolvedValueOnce({ data: null, error: { code: "PGRST202", message: "not found" } });
    expect(await fetchInventoryToday("org-1")).toBeNull();
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: "Not Found" }, status: 404 });
    expect(await fetchInventoryToday("org-1")).toBeNull();
    expect(captureFlowErrorMock).not.toHaveBeenCalled();
  });

  it("reporta as outras falhas e devolve null na mesma (timeout, privilégios)", async () => {
    const timeout = { code: "57014", message: "canceling statement due to statement timeout" };
    rpcMock.mockResolvedValueOnce({ data: null, error: timeout, status: 500 });
    expect(await fetchInventoryToday("org-1")).toBeNull();
    expect(captureFlowErrorMock).toHaveBeenLastCalledWith(timeout, "inventory-today-load");

    const denied = { code: "42501", message: "permission denied for function rpc_inventory_today" };
    rpcMock.mockResolvedValueOnce({ data: null, error: denied, status: 403 });
    expect(await fetchInventoryToday("org-1")).toBeNull();
    expect(captureFlowErrorMock).toHaveBeenLastCalledWith(denied, "inventory-today-load");

    // Exceção (rede) também é reportada — não há forma de a confundir com 404.
    const network = new Error("Failed to fetch");
    rpcMock.mockImplementationOnce(async () => {
      throw network;
    });
    expect(await fetchInventoryToday("org-1")).toBeNull();
    expect(captureFlowErrorMock).toHaveBeenLastCalledWith(network, "inventory-today-load");
    expect(captureFlowErrorMock).toHaveBeenCalledTimes(3);
  });

  it("devolve null sem reportar quando a RPC não traz dados", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: null, status: 200 });
    expect(await fetchInventoryToday("org-1")).toBeNull();
    expect(captureFlowErrorMock).not.toHaveBeenCalled();
  });
});

describe("fila de trabalho", () => {
  it("esconde cartões a null e mantém os a 0", () => {
    const keys = getInventoryQueueItems(payload, all).map((i) => i.key);
    expect(keys).not.toContain("price-changes");
    expect(keys).not.toContain("ec-no-supplier");
    expect(keys).toContain("delivery-notes-divergent"); // 0 → "Nada pendente"
    expect(keys).toContain("catalog-unlinked");
    expect(keys).not.toContain("transfers");
  });

  it("esconde cartões sem permissão para o destino e não os conta no total", () => {
    const noPo = (p: string) => p !== "purchase_orders.view";
    expect(getInventoryQueueItems(payload, noPo).some((i) => i.to === "/purchase-orders")).toBe(false);
    // 3+1 (POs) + 2 (EC) + 6 (baixo) + 0 + 2 + 5 + 0 = 19 com tudo; sem POs = 15.
    expect(getInventoryQueueTotal(payload, all)).toBe(19);
    expect(getInventoryQueueTotal(payload, noPo)).toBe(15);
  });

  it("sem dados não há total", () => {
    expect(getInventoryQueueTotal(null, all)).toBeNull();
  });
});

describe("contadores do menu", () => {
  it("Fornecedores soma preços + fichas, tolerando null", () => {
    expect(getInventoryCounter("suppliers", payload, all)).toBe(2);
    expect(
      getInventoryCounter("suppliers", { ...payload, suppliers: { price_changes_pending: null, awaiting_profile: null, catalog_unlinked: 3 } }, all),
    ).toBeNull();
  });

  it("mapeia cada contador ao campo certo", () => {
    expect(getInventoryCounter("purchaseOrders", payload, all)).toBe(3);
    expect(getInventoryCounter("stocks", payload, all)).toBe(6);
    expect(getInventoryCounter("clientOrders", payload, all)).toBe(2);
    expect(getInventoryCounter("receiving", payload, all)).toBe(4);
    expect(getInventoryCounter("stockCounts", payload, all)).toBe(0);
    expect(getInventoryCounter("today", payload, all)).toBe(19);
    expect(getInventoryCounter("stocks", null, all)).toBeNull();
  });
});

describe("menu do Inventário", () => {
  const section = menuSections.find((s) => s.id === "inventory")!;
  const items = [...section.items, ...(section.subSections ?? []).flatMap((s) => s.items)];

  it("cada entrada tem a permissão da sua rota", () => {
    const expected: Record<string, string> = {
      "/inventory": "inventory.view",
      "/purchase-orders": "purchase_orders.view",
      "/suppliers": "suppliers.view",
      "/stocks": "inventory.view",
      "/stock-movements": "inventory.view",
      "/client-orders": "client_orders.view",
      "/receiving": "receiving.view",
      "/stock-counts": "inventory.view",
      "/warehouses": "warehouses.view",
    };
    expect(items.map((i) => i.to).sort()).toEqual(Object.keys(expected).sort());
    for (const item of items) expect(item.permission).toBe(expected[item.to]);
    expect(section.paths.sort()).toEqual(Object.keys(expected).sort());
  });
});
