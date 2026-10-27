import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { buildClientOrderHistory } from "../clientOrderHistory";

describe("buildClientOrderHistory", () => {
  it("junta eventos, saídas/estornos e pedidos ao fornecedor, mais recente primeiro", () => {
    const h = buildClientOrderHistory({
      origin: "contract",
      events: [
        { id: "e1", event_type: "created", description: "Contrato criado", new_values: null, created_at: "2026-10-01T09:00:00Z" },
        { id: "e2", event_type: "status_changed", description: "x", new_values: { status: "signed" }, created_at: "2026-10-02T09:00:00Z" },
      ],
      movements: [
        { id: "m1", movement_type: "venda", quantity: -3, reversal_of_movement_id: null, created_at: "2026-10-04T09:00:00Z", product_name: "Torneira", warehouse_name: "Lisboa" },
        { id: "m2", movement_type: "estorno_venda", quantity: -3, reversal_of_movement_id: "m1", created_at: "2026-10-05T09:00:00Z", product_name: "Torneira", warehouse_name: "Lisboa" },
      ],
      purchaseOrders: [{ id: "p1", order_number: "PO-2026-0001", created_at: "2026-10-03T09:00:00Z" }],
    });
    expect(h.map((x) => x.text)).toEqual([
      "Estorno de saída: 3 × Torneira volta(m) ao stock (Lisboa)",
      "Saída de stock: 3 × Torneira (Lisboa)",
      "Pedido ao fornecedor: PO-2026-0001",
      "Contrato assinado: encomenda aberta",
      "Contrato criado",
    ]);
  });

  it("eliminar: um só registo com o motivo; o texto segue a origem", () => {
    const h = buildClientOrderHistory({
      origin: "manual",
      events: [
        { id: "e1", event_type: "created", description: null, new_values: null, created_at: "2026-10-01T09:00:00Z" },
        { id: "e2", event_type: "status_changed", description: null, new_values: { status: "cancelled" }, created_at: "2026-10-06T09:00:00Z" },
        { id: "e3", event_type: "contract_cancelled", description: "Duplicada", new_values: null, created_at: "2026-10-06T09:00:01Z" },
      ],
      movements: [],
      purchaseOrders: [],
    });
    expect(h.map((x) => x.text)).toEqual(["Eliminada — Duplicada", "Encomenda manual criada"]);
  });

  it("anulação só pelo estado (contrato substituído) fica como 'Anulada'; sem data não entra", () => {
    const h = buildClientOrderHistory({
      origin: "contract",
      events: [
        { id: "e1", event_type: "status_changed", description: null, new_values: { status: "cancelled" }, created_at: "2026-10-06T09:00:00Z" },
        { id: "e2", event_type: "created", description: null, new_values: null, created_at: null },
      ],
      movements: [],
      purchaseOrders: [],
    });
    expect(h.map((x) => x.text)).toEqual(["Anulada"]);
  });
});
