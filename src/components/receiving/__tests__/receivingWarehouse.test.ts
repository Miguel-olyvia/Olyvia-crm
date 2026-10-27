import { describe, expect, it } from "vitest";
import { pickReceivingWarehouse, type WarehousePick } from "../receivingWarehouse";

const whs = [{ id: "a" }, { id: "b" }];
const p = (o: Partial<WarehousePick>) =>
  pickReceivingWarehouse({ current: "", remembered: null, orgDefault: null, warehouses: whs, loadError: false, ...o });

describe("pickReceivingWarehouse", () => {
  it("mantém o atual e depois o último escolhido", () => {
    expect(p({ current: "b", remembered: "a", orgDefault: "a" })).toBe("b");
    expect(p({ remembered: "b", orgDefault: "a" })).toBe("b");
  });
  it("sem escolha anterior usa o armazém por omissão da organização (o armazém da PO no 2.0)", () => {
    expect(p({ orgDefault: "b" })).toBe("b");
    expect(p({ remembered: "x-apagado", orgDefault: "a" })).toBe("a");
  });
  it("por omissão inexistente/apagado: o único armazém, ou nenhum", () => {
    expect(p({ orgDefault: "zzz" })).toBe("");
    expect(pickReceivingWarehouse({ current: "", remembered: null, orgDefault: "zzz", warehouses: [{ id: "a" }], loadError: false })).toBe("a");
  });
  it("lista com erro: mantém o atual (não há como validar)", () => {
    expect(p({ current: "q", loadError: true, orgDefault: "a" })).toBe("q");
  });
});
