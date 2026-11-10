import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

// 20270112850000/851: o valor por receber lê as linhas pela vista po_v_purchase_order_items (a tabela deixa de dar
// total_price), pelos ids das POs em aberto lidas antes — sem embed purchase_orders!inner a partir da vista.
const db = vi.hoisted(() => ({
  tables: {} as Record<string, Record<string, unknown>[]>,
  calls: [] as { table: string; ops: [string, ...unknown[]][] }[],
}));
vi.mock("@/integrations/supabase/client", () => {
  const from = (table: string) => {
    const call = { table, ops: [] as [string, ...unknown[]][] };
    db.calls.push(call);
    const b: Record<string, unknown> = {};
    for (const op of ["select", "eq", "in", "is", "order", "range"]) {
      b[op] = (...args: unknown[]) => {
        call.ops.push([op, ...args]);
        return b;
      };
    }
    b.then = (ok: (v: unknown) => unknown) => {
      let rows = db.tables[table] ?? [];
      for (const [op, col, val] of call.ops) {
        if (op === "eq") rows = rows.filter((r) => r[col as string] === val);
        if (op === "in") rows = rows.filter((r) => (val as unknown[]).includes(r[col as string]));
      }
      return Promise.resolve({ data: rows, error: null }).then(ok);
    };
    return b;
  };
  return { supabase: { from } };
});

import { usePoKpis } from "../PoKpis";

describe("usePoKpis — valor por receber pela vista", () => {
  it("lê po_v_purchase_order_items só das POs em aberto e nunca a tabela purchase_order_items", async () => {
    db.calls.length = 0;
    db.tables = {
      purchase_orders: [
        { id: "a", organization_id: "org", status: "ordered", expected_delivery: null },
        { id: "b", organization_id: "org", status: "pending", expected_delivery: null },
        { id: "c", organization_id: "org", status: "partially_received", expected_delivery: null },
      ],
      po_v_purchase_order_items: [
        { id: "1", purchase_order_id: "a", quantity: 2, received_quantity: 0, total_price: 100 },
        { id: "2", purchase_order_id: "b", quantity: 1, received_quantity: 0, total_price: 999 },
        { id: "3", purchase_order_id: "c", quantity: 4, received_quantity: 1, total_price: 40 },
      ],
    };
    const { result } = renderHook(() => usePoKpis("org", 1, true));
    await waitFor(() => expect(result.current?.openValue).not.toBeNull());
    expect(result.current?.openValue).toBe(130);
    expect(db.calls.some((c) => c.table === "purchase_order_items")).toBe(false);
    const linhas = db.calls.filter((c) => c.table === "po_v_purchase_order_items");
    expect(linhas).toHaveLength(1);
    expect(linhas[0].ops.find((o) => o[0] === "in")).toEqual(["in", "purchase_order_id", ["a", "c"]]);
  });

  it("sem permissão não lê as linhas", async () => {
    db.calls.length = 0;
    const { result } = renderHook(() => usePoKpis("org", 2, false));
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current?.openValue).toBeNull();
    expect(db.calls.some((c) => c.table === "po_v_purchase_order_items")).toBe(false);
  });
});
