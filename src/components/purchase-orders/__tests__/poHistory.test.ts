import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: vi.fn() } }));

import { describePoAuditRow, lastShipmentFromAudit, orderedAtFromAudit, poHistoryEntries, type PoAuditRow } from "../poHistory";

// Formas reais lidas da BD RH (entity_audit_log, table_name='purchase_orders').
const rows: PoAuditRow[] = [
  {
    id: "1",
    operation: "INSERT",
    source: "web_app",
    changed_by: "u1",
    created_at: "2026-10-27T17:00:35Z",
    changed_fields: {
      purchase_order_items: { new: [{ description: "x" }] },
      purchase_orders: { status: { old: null, new: "pending" }, order_number: { old: null, new: "PO-2026-0002" } },
    },
  },
  {
    id: "2",
    operation: "UPDATE",
    source: "web_app",
    changed_by: "u1",
    created_at: "2026-10-27T17:00:40Z",
    changed_fields: {
      status: { old: "pending", new: "ordered" },
      supplier_publication: { old: null, new: { link_id: "l", revision: 1, status: "sent" } },
    },
  },
  {
    id: "3",
    operation: "UPDATE",
    source: "supplier_portal",
    changed_by: null,
    created_at: "2026-10-27T17:01:21Z",
    changed_fields: {
      supplier_publication: { old: { status: "sent" }, new: { status: "confirmed", promised_date: "2026-10-29", revision: 1 } },
    },
  },
  {
    id: "4",
    operation: "UPDATE",
    source: "supplier_portal",
    changed_by: null,
    created_at: "2026-10-27T17:01:41Z",
    changed_fields: {
      supplier_shipment: { old: null, new: { note_number: "12345", ship_date: "2026-10-27", lines: 1, carrier: null } },
    },
  },
  {
    id: "5",
    operation: "UPDATE",
    source: null,
    changed_by: "u1",
    created_at: "2026-10-27T17:49:20Z",
    changed_fields: { status: { old: "ordered", new: "received" }, actual_delivery_date: { old: null, new: "2026-10-27" } },
  },
];

describe("describePoAuditRow", () => {
  it("criação com o estado e as linhas", () => {
    expect(describePoAuditRow(rows[0])).toEqual({ title: "Encomenda criada (Pendente)", details: ["1 linha(s)"] });
  });
  it("encomendar e publicar no portal", () => {
    expect(describePoAuditRow(rows[1])).toEqual({
      title: "Encomendada e publicada no portal do fornecedor",
      details: ["Estado: Pendente → Encomendado"],
    });
  });
  it("confirmação do fornecedor com a data prometida", () => {
    expect(describePoAuditRow(rows[2])).toEqual({ title: "Confirmada pelo fornecedor", details: ["Entrega prometida: 29/10/2026"] });
  });
  it("expedição (supplier_shipment) com a guia", () => {
    expect(describePoAuditRow(rows[3])).toEqual({
      title: "Expedida pelo fornecedor com a guia GR 12345",
      details: ["Expedição: 27/10/2026", "1 linha(s)"],
    });
  });
  it("receção (gatilho genérico): estado e data de entrega", () => {
    expect(describePoAuditRow(rows[4])).toEqual({ title: "Estado: Encomendado → Recebida", details: ["Data de entrega: 27/10/2026"] });
  });
  it("aceitar data prometida", () => {
    expect(
      describePoAuditRow({
        operation: "UPDATE",
        changed_fields: { expected_delivery: { old: "2026-10-30", new: "2026-10-29" }, source: "supplier_promised_date" },
      }),
    ).toEqual({ title: "Data prometida pelo fornecedor aceite", details: ["Entrega prevista: 30/10/2026 → 29/10/2026"] });
  });
  it("retirada do portal com motivo", () => {
    expect(
      describePoAuditRow({
        operation: "UPDATE",
        changed_fields: { supplier_publication: { old: { status: "sent" }, new: { status: "withdrawn", revision: 2, reason: "erro" } } },
      }),
    ).toEqual({ title: "Retirada do portal do fornecedor", details: ["Motivo: erro"] });
  });
  it("edição gravada pela RPC (diff aninhado) mostra os campos e as linhas", () => {
    const d = describePoAuditRow({
      operation: "UPDATE",
      changed_fields: {
        purchase_orders: { notes: { old: null, new: "x" }, total_value: { old: 10, new: 12.3 } },
        purchase_order_items: { new: [{}, {}] },
      },
    });
    expect(d.title).toBe("Encomenda alterada");
    expect(d.details).toContain("Notas internas alteradas");
    expect(d.details).toContain("Linhas gravadas (2)");
  });
});

describe("datas para a linha de etapas", () => {
  it("orderedAtFromAudit: a última passagem a Encomendado", () => {
    expect(orderedAtFromAudit(rows)).toBe("2026-10-27T17:00:40Z");
    expect(orderedAtFromAudit([])).toBeNull();
  });
  it("lastShipmentFromAudit: a última guia expedida", () => {
    expect(lastShipmentFromAudit(rows)).toEqual({ noteNumber: "GR 12345", shipDate: "2026-10-27", at: "2026-10-27T17:01:41Z" });
  });
});

describe("poHistoryEntries", () => {
  it("do mais recente para o mais antigo, com quem fez", () => {
    const e = poHistoryEntries(rows, new Map([["u1", "Rafael"]]));
    expect(e.map((x) => x.id)).toEqual(["5", "4", "3", "2", "1"]);
    expect(e[1].actor).toBe("Portal do fornecedor");
    expect(e[4].actor).toBe("Rafael");
  });
});
