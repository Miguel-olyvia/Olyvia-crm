import { describe, expect, it } from "vitest";
import {
  deletedRowOrigin,
  filterDeletedRows,
  filterRowsByOrigin,
  mapDeletedContract,
  mergeWithDeleted,
  rowOrigin,
  type ClientOrderListEntry,
  type DeletedClientOrderRow,
} from "../clientOrderFilters";
import {
  clientOrdersLink,
  parseClientOrdersOrigin,
  parseClientOrdersParams,
} from "@/components/inventory/ui/inventoryLinks";

const del = (over: Partial<DeletedClientOrderRow>): DeletedClientOrderRow => ({
  contract_id: "d",
  contract_number: "CT-1",
  order_number: null,
  client_name: null,
  signature_date: null,
  deleted_at: null,
  delete_reason: null,
  delivery_address: null,
  notes: null,
  total_value: null,
  is_manual_order: false,
  ...over,
});

describe("origem (?origin=)", () => {
  it("o link e o parser fazem ida e volta; o valor por omissão não vai para o URL", () => {
    expect(clientOrdersLink({ origin: "direct_sale" })).toBe("/client-orders?origin=direct_sale");
    expect(clientOrdersLink({ origin: "all" })).toBe("/client-orders");
    expect(clientOrdersLink({ ready: true, origin: "manual" })).toBe("/client-orders?ready=1&origin=manual");
    expect(parseClientOrdersOrigin("?origin=manual")).toBe("manual");
    expect(parseClientOrdersOrigin("?origin=xpto")).toBe("all");
    expect(parseClientOrdersOrigin("")).toBe("all");
  });

  it("não muda o que parseClientOrdersParams já devolvia", () => {
    expect(parseClientOrdersParams("?origin=manual&ready=1")).toEqual({ status: "all", ready: true, open: null });
  });

  it("filtra por origin_type; sem origin_type conta como contrato", () => {
    const rows = [
      { id: 1, origin_type: "contract" },
      { id: 2, origin_type: "direct_sale" },
      { id: 3, origin_type: "manual" },
      { id: 4, origin_type: null },
    ];
    expect(filterRowsByOrigin(rows, "all").map((r) => r.id)).toEqual([1, 2, 3, 4]);
    expect(filterRowsByOrigin(rows, "contract").map((r) => r.id)).toEqual([1, 4]);
    expect(filterRowsByOrigin(rows, "direct_sale").map((r) => r.id)).toEqual([2]);
    expect(filterRowsByOrigin(rows, "manual").map((r) => r.id)).toEqual([3]);
    expect(rowOrigin({})).toBe("contract");
  });
});

describe("eliminadas", () => {
  it("mapeia client_contracts: cliente do embed, data da eliminação (ou da anulação) e motivo", () => {
    const r = mapDeletedContract({
      id: "c1",
      contract_number: "CT-9",
      order_number: "EC-2026-0009",
      is_manual_order: true,
      signature_date: "2026-10-01T10:00:00Z",
      deleted_at: null,
      cancelled_at: "2026-10-02T09:00:00Z",
      cancellation_reason: " Cliente desistiu ",
      total_value: "120.5",
      entity: { display_name: "Ana" },
    });
    expect(r).toMatchObject({
      contract_id: "c1",
      order_number: "EC-2026-0009",
      client_name: "Ana",
      deleted_at: "2026-10-02T09:00:00Z",
      delete_reason: "Cliente desistiu",
      total_value: 120.5,
      is_manual_order: true,
    });
    expect(mapDeletedContract({ contract_number: "sem id" })).toBeNull();
  });

  it("origem: venda direta ligada ganha; senão manual/contrato", () => {
    expect(deletedRowOrigin(del({ is_manual_order: true }), true)).toBe("direct_sale");
    expect(deletedRowOrigin(del({ is_manual_order: true }), false)).toBe("manual");
    expect(deletedRowOrigin(del({}), false)).toBe("contract");
  });

  it("filtros: estado/prontas excluem; pesquisa, datas e origem como a lista", () => {
    const rows = [
      del({ contract_id: "a", order_number: "EC-1", client_name: "Ana", signature_date: "2026-10-05T12:00:00Z", is_manual_order: true }),
      del({ contract_id: "b", contract_number: "CT-77", client_name: "Bruno", signature_date: "2026-09-01T12:00:00Z" }),
    ];
    const originOf = (r: DeletedClientOrderRow) => deletedRowOrigin(r, false);
    const base = { search: "", dateFrom: "", dateTo: "", origin: "all" as const, statusActive: false };
    expect(filterDeletedRows(rows, { ...base, statusActive: true }, originOf)).toEqual([]);
    expect(filterDeletedRows(rows, base, originOf).map((r) => r.contract_id)).toEqual(["a", "b"]);
    expect(filterDeletedRows(rows, { ...base, search: "ct-77" }, originOf).map((r) => r.contract_id)).toEqual(["b"]);
    expect(filterDeletedRows(rows, { ...base, search: "ana" }, originOf).map((r) => r.contract_id)).toEqual(["a"]);
    expect(filterDeletedRows(rows, { ...base, dateFrom: "2026-10-01" }, originOf).map((r) => r.contract_id)).toEqual(["a"]);
    expect(filterDeletedRows(rows, { ...base, dateTo: "2026-09-30" }, originOf).map((r) => r.contract_id)).toEqual(["b"]);
    expect(filterDeletedRows(rows, { ...base, origin: "manual" }, originOf).map((r) => r.contract_id)).toEqual(["a"]);
    // nº da venda direta/proforma (vem de direct_sales, não da linha)
    expect(
      filterDeletedRows(rows, { ...base, search: "VD-2026-3" }, originOf, (r) => (r.contract_id === "b" ? ["VD-2026-3"] : []))
        .map((r) => r.contract_id),
    ).toEqual(["b"]);
  });

  it("intercala pela data; com páginas por carregar guarda as mais antigas que a última ativa", () => {
    const active = [
      { id: "x", signature_date: "2026-10-10T00:00:00Z" },
      { id: "y", signature_date: "2026-10-01T00:00:00Z" },
    ];
    const deleted = [
      del({ contract_id: "old", signature_date: "2026-09-01T00:00:00Z" }),
      del({ contract_id: "mid", signature_date: "2026-10-05T00:00:00Z" }),
      del({ contract_id: "new", signature_date: "2026-10-20T00:00:00Z" }),
      del({ contract_id: "nodate", signature_date: null }),
    ];
    const ids = (e: ClientOrderListEntry<{ id: string }, DeletedClientOrderRow>[]) =>
      e.map((x) => (x.kind === "active" ? x.row.id : `-${x.row.contract_id}`));
    expect(ids(mergeWithDeleted(active, deleted, true))).toEqual(["-new", "x", "-mid", "y", "-old", "-nodate"]);
    expect(ids(mergeWithDeleted(active, deleted, false))).toEqual(["-new", "x", "-mid", "y"]);
    expect(ids(mergeWithDeleted([], deleted, false))).toEqual([]);
    expect(ids(mergeWithDeleted([], deleted.slice(0, 1), true))).toEqual(["-old"]);
  });
});
