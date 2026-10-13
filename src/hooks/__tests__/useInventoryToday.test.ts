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
import {
  fetchClientOrderReadiness,
  fetchClientOrderRowsByIds,
  readyContractIds,
} from "@/components/client-orders/clientOrderList";
import {
  PO_STATUS_FILTERS,
  clientOrdersLink,
  purchaseOrdersLink,
  parseClientOrdersParams,
  parsePurchaseOrdersParams,
  parseReceivingParams,
  parseStockCountsParams,
  parseStocksParams,
  parseSuppliersParams,
} from "@/components/inventory/ui/inventoryLinks";

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
    expect(getInventoryQueueItems(payload, noPo).some((i) => i.to.startsWith("/purchase-orders"))).toBe(false);
    // 3+1 (POs) + 2 (EC) + 6 (baixo) + 0 + 2 + 5 + 0 = 19 com tudo; sem POs = 15.
    expect(getInventoryQueueTotal(payload, all)).toBe(19);
    expect(getInventoryQueueTotal(payload, noPo)).toBe(15);
  });

  it("cada cartão abre a lista já filtrada, com valores aceites pelo parser do destino", () => {
    const full: InventoryTodayPayload = {
      ...payload,
      suppliers: { price_changes_pending: 1, awaiting_profile: 2, catalog_unlinked: 5 },
      client_orders: { ...payload.client_orders!, without_preferred_supplier: 1 },
    };
    const to = Object.fromEntries(getInventoryQueueItems(full, all).map((i) => [i.key, i.to]));
    expect(to).toEqual({
      "po-pending": "/purchase-orders?status=pending",
      "po-late": "/purchase-orders?status=late",
      "ec-ready": "/client-orders?ready=1",
      "ec-no-supplier": "/client-orders?status=sem_fornecedor",
      "price-changes": "/suppliers?filter=prices",
      "stock-low": "/stocks?status=low",
      "counts-stalled": "/stock-counts?stalled=1",
      "suppliers-awaiting": "/suppliers?filter=awaiting",
      "catalog-unlinked": "/suppliers?filter=catalog",
      "delivery-notes-divergent": "/receiving?notes=divergent",
    });
    // Ida e volta: o parser de cada página lê o filtro (valor desconhecido cairia em "all").
    const query = (url: string) => url.slice(url.indexOf("?"));
    expect(parsePurchaseOrdersParams(query(to["po-pending"])).status).toBe("pending");
    expect(parsePurchaseOrdersParams(query(to["po-late"])).status).toBe("late");
    expect(parseClientOrdersParams(query(to["ec-ready"])).ready).toBe(true);
    expect(parseClientOrdersParams(query(to["ec-no-supplier"])).status).toBe("sem_fornecedor");
    expect(parseSuppliersParams(query(to["price-changes"])).filter).toBe("prices");
    expect(parseSuppliersParams(query(to["suppliers-awaiting"])).filter).toBe("awaiting");
    expect(parseSuppliersParams(query(to["catalog-unlinked"])).filter).toBe("catalog");
    expect(parseStocksParams(query(to["stock-low"])).status).toBe("low");
    expect(parseStockCountsParams(query(to["counts-stalled"])).stalled).toBe(true);
    expect(parseReceivingParams(query(to["delivery-notes-divergent"])).notes).toBe("divergent");
  });

  it("sem dados não há total", () => {
    expect(getInventoryQueueTotal(null, all)).toBeNull();
  });
});

describe("destino \"Prontas a expedir\" (Encomendas Clientes ?ready=1)", () => {
  beforeEach(() => rpcMock.mockReset());

  it("o cartão e o fluxo usam clientOrdersLink({ ready: true }), lido pelo parser", () => {
    expect(clientOrdersLink({ ready: true })).toBe("/client-orders?ready=1");
    expect(parseClientOrdersParams("?ready=1")).toEqual({ status: "all", ready: true, open: null });
  });

  it("prontidão: uma chamada à RPC com a organização ativa; prontas = lines_ready > 0", async () => {
    rpcMock.mockResolvedValueOnce({
      data: [
        { contract_id: "c1", lines_ready: 2, units_ready: "5", units_in_stock_reserved: "5", units_on_po: "0", units_missing: "1", units_served: "3", units_received: "0", units_needed: "9" },
        { contract_id: "c2", lines_ready: 0, units_ready: 0, units_in_stock_reserved: 0, units_on_po: 4, units_missing: 0, units_served: 0, units_received: 0, units_needed: 4 },
      ],
      error: null,
    });
    const map = await fetchClientOrderReadiness("org-1");
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith("rpc_client_order_list_readiness", { p_organization_id: "org-1" });
    expect(map.c1).toMatchObject({ lines_ready: 2, units_in_stock_reserved: 5, units_served: 3, units_missing: 1 });
    expect([...readyContractIds(map)]).toEqual(["c1"]);
  });

  it("filtro: lê a lista por páginas só até encontrar todas as prontas, com os mesmos filtros", async () => {
    const page = (start: number, n: number) =>
      Array.from({ length: n }, (_, i) => ({ contract_id: `c${start + i}` }));
    rpcMock
      .mockResolvedValueOnce({ data: page(0, 100), error: null })
      .mockResolvedValueOnce({ data: page(100, 100), error: null })
      .mockResolvedValueOnce({ data: page(200, 100), error: null });
    const filters = { search: "ab", status: "all", dateFrom: "2026-01-01", dateTo: "" };
    const { rows, truncated } = await fetchClientOrderRowsByIds("org-1", filters, new Set(["c5", "c150"]), 20);
    expect(rows.map((r) => r.contract_id)).toEqual(["c5", "c150"]);
    expect(truncated).toBe(false);
    expect(rpcMock).toHaveBeenCalledTimes(2); // pára na 2.ª página
    expect(rpcMock).toHaveBeenLastCalledWith("rpc_list_client_order_documents", {
      p_organization_id: "org-1",
      p_search: "ab",
      p_status_filter: null,
      p_limit: 100,
      p_offset: 100,
      p_date_from: "2026-01-01",
      p_date_to: null,
    });
  });

  it("filtro: sem prontas não chama a lista; teto atingido = truncado", async () => {
    const none = { search: "", status: "all", dateFrom: "", dateTo: "" };
    expect(await fetchClientOrderRowsByIds("org-1", none, new Set(), 20)).toEqual({ rows: [], truncated: false });
    expect(rpcMock).not.toHaveBeenCalled();
    rpcMock.mockResolvedValue({ data: Array.from({ length: 100 }, (_, i) => ({ contract_id: `x${i}` })), error: null });
    expect(await fetchClientOrderRowsByIds("org-1", none, new Set(["nao-existe"]), 2)).toEqual({ rows: [], truncated: true });
    expect(rpcMock).toHaveBeenCalledTimes(2);
  });

  it("portal: \"por ver\" e \"confirmou\" partilham ?status=portal (o filtro das POs não tem sub-estado)", () => {
    expect(purchaseOrdersLink({ status: "portal" })).toBe("/purchase-orders?status=portal");
    expect(PO_STATUS_FILTERS.filter((s) => s.startsWith("portal"))).toEqual(["portal"]);
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
