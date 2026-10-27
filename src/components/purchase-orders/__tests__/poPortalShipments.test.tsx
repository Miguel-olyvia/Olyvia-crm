import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Base falsa: cada from(tabela) devolve um construtor encadeável que regista os filtros e, ao ser lido (await),
// devolve as linhas da tabela que passam nos filtros eq/in (os outros só ficam registados).
const db = vi.hoisted(() => ({
  tables: {} as Record<string, Record<string, unknown>[]>,
  calls: [] as { table: string; ops: [string, ...unknown[]][] }[],
}));
vi.mock("@/integrations/supabase/client", () => {
  const from = (table: string) => {
    const call = { table, ops: [] as [string, ...unknown[]][] };
    db.calls.push(call);
    const b: Record<string, unknown> = {};
    for (const op of ["select", "eq", "in", "is", "contains", "order", "range", "neq"]) {
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

import {
  activeShipment,
  computePoShipments,
  fetchPoPortalShipments,
  poShipmentLabel,
  type PoShipmentInputs,
  type PortalShipNoteRow,
} from "../poPortalShipments";
import { PoShippedPill } from "../PoStatusPills";

const shipped = (po: string, at = "2026-10-27T17:01:41Z") => [
  { action: "shipped", origin: "supplier_portal", at, by_name: "fornecedor", carrier: null, purchase_order_id: po, revision: 1 },
];
const note = (id: string, number: string, po: string, status = "open", at?: string): PortalShipNoteRow => ({
  id,
  note_number: number,
  created_at: at ?? "2026-10-27T17:00:00Z",
  status,
  history: shipped(po, at),
});
const base = (over: Partial<PoShipmentInputs> = {}): PoShipmentInputs => ({
  notes: [note("n1", "12345", "po1")],
  links: [{ delivery_note_id: "n1", purchase_order_id: "po1" }],
  lines: [{ delivery_note_id: "n1", purchase_order_item_id: "i1", quantity: 1, units_per_uom: 1 }],
  receipts: [],
  items: [{ id: "i1", purchase_order_id: "po1", quantity: 1, received_quantity: 0, units_per_uom: 1 }],
  ...over,
});

describe("computePoShipments", () => {
  it("PO-2026-0002: guia 12345 aberta com tudo o que foi encomendado = Expedida", () => {
    const m = computePoShipments(base());
    expect(m.get("po1")).toMatchObject({ noteId: "n1", noteNumber: "12345", count: 1, partial: false });
    expect(poShipmentLabel(m.get("po1")!)).toBe("Expedida · GR 12345");
  });

  it("sem guias do portal (ou guia manual, sem shipped/supplier_portal) = nada", () => {
    expect(computePoShipments(base({ notes: [] })).size).toBe(0);
    const manual = { ...note("n1", "12345", "po1"), history: [{ action: "close", at: "2026-10-27" }] };
    expect(computePoShipments(base({ notes: [manual] })).size).toBe(0);
  });

  it("só guias abertas dão distintivo (fechada ou cancelada = nada)", () => {
    expect(computePoShipments(base({ notes: [note("n1", "12345", "po1", "closed")] })).size).toBe(0);
    expect(computePoShipments(base({ notes: [note("n1", "12345", "po1", "cancelled")] })).size).toBe(0);
  });

  it("expediu menos do que o encomendado = Parcialmente expedida", () => {
    const m = computePoShipments(base({ items: [{ id: "i1", purchase_order_id: "po1", quantity: 5, received_quantity: 0, units_per_uom: 1 }] }));
    expect(m.get("po1")?.partial).toBe(true);
    expect(poShipmentLabel(m.get("po1")!)).toBe("Parcialmente expedida · GR 12345");
  });

  it("linha da PO não anunciada na guia conta como por expedir", () => {
    const m = computePoShipments(
      base({
        items: [
          { id: "i1", purchase_order_id: "po1", quantity: 1, received_quantity: 0, units_per_uom: 1 },
          { id: "i2", purchase_order_id: "po1", quantity: 2, received_quantity: 0, units_per_uom: 1 },
        ],
      }),
    );
    expect(m.get("po1")?.partial).toBe(true);
  });

  it("o já recebido e as guias fechadas (só o recebido com elas) completam a expedição", () => {
    // 10 encomendadas: 4 numa guia já fechada e recebida, 6 numa aberta = tudo expedido
    const m = computePoShipments(
      base({
        notes: [note("n0", "GR-1", "po1", "closed", "2026-10-20T10:00:00Z"), note("n1", "GR-2", "po1")],
        links: [
          { delivery_note_id: "n0", purchase_order_id: "po1" },
          { delivery_note_id: "n1", purchase_order_id: "po1" },
        ],
        lines: [
          { delivery_note_id: "n0", purchase_order_item_id: "i1", quantity: 4, units_per_uom: 1 },
          { delivery_note_id: "n1", purchase_order_item_id: "i1", quantity: 6, units_per_uom: 1 },
        ],
        receipts: [{ delivery_note_id: "n0", purchase_order_item_id: "i1", quantity: 4, units_per_uom: 1 }],
        items: [{ id: "i1", purchase_order_id: "po1", quantity: 10, received_quantity: 4, units_per_uom: 1 }],
      }),
    );
    expect(m.get("po1")).toMatchObject({ noteId: "n1", noteNumber: "GR-2", count: 1, partial: false });
  });

  it("guia fechada com falta não conta o que não chegou (como fn_sp_po_shipped)", () => {
    const m = computePoShipments(
      base({
        notes: [note("n0", "A", "po1", "closed", "2026-10-20T10:00:00Z"), note("n1", "B", "po1")],
        links: [
          { delivery_note_id: "n0", purchase_order_id: "po1" },
          { delivery_note_id: "n1", purchase_order_id: "po1" },
        ],
        lines: [
          { delivery_note_id: "n0", purchase_order_item_id: "i1", quantity: 4, units_per_uom: 1 },
          { delivery_note_id: "n1", purchase_order_item_id: "i1", quantity: 6, units_per_uom: 1 },
        ],
        receipts: [{ delivery_note_id: "n0", purchase_order_item_id: "i1", quantity: 3, units_per_uom: 1 }],
        items: [{ id: "i1", purchase_order_id: "po1", quantity: 10, received_quantity: 3, units_per_uom: 1 }],
      }),
    );
    expect(m.get("po1")?.partial).toBe(true);
  });

  it("converte embalagens: guia em unidades de stock vs linha em caixas de 6", () => {
    const m = computePoShipments(
      base({
        lines: [{ delivery_note_id: "n1", purchase_order_item_id: "i1", quantity: 12, units_per_uom: 1 }],
        items: [{ id: "i1", purchase_order_id: "po1", quantity: 2, received_quantity: 0, units_per_uom: 6 }],
      }),
    );
    expect(m.get("po1")?.partial).toBe(false);
  });

  it("várias guias abertas: a mais antiga primeiro e +N", () => {
    const m = computePoShipments(
      base({
        notes: [note("n2", "222", "po1", "open", "2026-10-27T12:00:00Z"), note("n1", "111", "po1", "open", "2026-10-26T12:00:00Z")],
        links: [
          { delivery_note_id: "n1", purchase_order_id: "po1" },
          { delivery_note_id: "n2", purchase_order_id: "po1" },
        ],
      }),
    );
    expect(m.get("po1")).toMatchObject({ noteId: "n1", count: 2 });
    expect(poShipmentLabel(m.get("po1")!)).toBe("Expedida · GR 111 +1");
  });

  it("liga pela purchase_order_id do history mesmo sem supplier_delivery_note_orders", () => {
    expect(computePoShipments(base({ links: [] })).get("po1")?.noteId).toBe("n1");
  });
});

describe("activeShipment", () => {
  const m = computePoShipments(base());
  it("só em POs que ainda se recebem", () => {
    for (const status of ["pending", "ordered", "partially_received"]) expect(activeShipment({ id: "po1", status }, m)).not.toBeNull();
    for (const status of ["received", "cancelled", "draft"]) expect(activeShipment({ id: "po1", status }, m)).toBeNull();
  });
  it("eliminada ou sem guia = null (Receber volta ao diálogo de sempre)", () => {
    expect(activeShipment({ id: "po1", status: "ordered", deleted_at: "2026-10-27" }, m)).toBeNull();
    expect(activeShipment({ id: "po2", status: "ordered" }, m)).toBeNull();
  });
});

describe("PoShippedPill", () => {
  it("mostra o nº da guia", () => {
    render(<PoShippedPill shipment={{ noteId: "n1", noteNumber: "12345", shippedAt: null, hasFile: false, count: 1, partial: false }} />);
    expect(screen.getByText("Expedida · GR 12345")).toBeInTheDocument();
  });
});

describe("fetchPoPortalShipments (leitura em lote)", () => {
  it("lê as guias abertas do portal, as POs, as linhas e as receções das fechadas — sem uma leitura por PO", async () => {
    const org = "org1";
    db.calls.length = 0;
    db.tables = {
      supplier_delivery_notes: [
        { ...note("n1", "12345", "po1"), organization_id: org },
        { ...note("n0", "GR-1", "po1", "closed", "2026-10-20T10:00:00Z"), organization_id: org },
      ],
      supplier_delivery_note_orders: [
        { delivery_note_id: "n1", purchase_order_id: "po1", organization_id: org },
        { delivery_note_id: "n0", purchase_order_id: "po1", organization_id: org },
      ],
      supplier_delivery_note_lines: [
        { delivery_note_id: "n0", purchase_order_item_id: "i1", quantity: 4, units_per_uom: 1, organization_id: org },
        { delivery_note_id: "n1", purchase_order_item_id: "i1", quantity: 6, units_per_uom: 1, organization_id: org },
      ],
      purchase_order_receipts: [
        { delivery_note_id: "n0", purchase_order_item_id: "i1", quantity: 4, units_per_uom: 1, organization_id: org, kind: "receipt" },
      ],
      purchase_order_items: [{ id: "i1", purchase_order_id: "po1", quantity: 10, received_quantity: 4, units_per_uom: 1, item_type: "product" }],
    };
    const m = await fetchPoPortalShipments(org);
    expect(m.get("po1")).toMatchObject({ noteId: "n1", noteNumber: "12345", count: 1, partial: false });
    const first = db.calls[0];
    expect(first.table).toBe("supplier_delivery_notes");
    expect(first.ops).toContainEqual(["eq", "status", "open"]);
    expect(first.ops).toContainEqual(["contains", "history", JSON.stringify([{ action: "shipped", origin: "supplier_portal" }])]);
    // no máximo 7 leituras para a página inteira (guias abertas, ligações, ligações das POs, linhas das POs, guias fechadas, linhas, receções)
    expect(db.calls.length).toBeLessThanOrEqual(7);
  });

  it("sem guias abertas do portal: uma só leitura e mapa vazio", async () => {
    db.calls.length = 0;
    db.tables = { supplier_delivery_notes: [] };
    expect((await fetchPoPortalShipments("org1")).size).toBe(0);
    expect(db.calls).toHaveLength(1);
  });
});
