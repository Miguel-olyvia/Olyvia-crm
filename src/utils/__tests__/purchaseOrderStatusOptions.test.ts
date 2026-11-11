// A base recusa criar uma encomenda com outro estado que não pendente (ou encomendada, com purchase_orders.approve):
// «Uma encomenda nasce pendente». O formulário só oferece o que ela aceita; «Cancelada» é só de edição.
import { describe, expect, it } from "vitest";
import { poStatusOptions } from "../purchaseOrderStatusOptions";

const valores = (o: ReturnType<typeof poStatusOptions>) => o.map((x) => x.value);

describe("poStatusOptions", () => {
  it("ao criar só oferece «pending» (encomendar faz-se por «Aprovar e enviar»)", () => {
    expect(valores(poStatusOptions({ editing: false, currentStatus: "pending", savedStatus: null }))).toEqual(["pending"]);
  });

  it("ao criar nunca oferece «cancelled», nem com um estado antigo no formulário", () => {
    for (const currentStatus of ["cancelled", "received", "partially_received", "ordered"]) {
      expect(valores(poStatusOptions({ editing: false, currentStatus, savedStatus: null }))).toEqual(["pending"]);
    }
  });

  it("ao editar oferece «pending» e «cancelled»", () => {
    expect(valores(poStatusOptions({ editing: true, currentStatus: "pending", savedStatus: "pending" }))).toEqual(["pending", "cancelled"]);
  });

  it("ao editar uma encomendada mostra «ordered» desativada", () => {
    const o = poStatusOptions({ editing: true, currentStatus: "ordered", savedStatus: "ordered" });
    expect(o).toEqual([
      { value: "pending", disabled: false }, { value: "ordered", disabled: true }, { value: "cancelled", disabled: false },
    ]);
  });

  it("ao editar uma recebida mostra «received»; parcialmente recebida fica desativada", () => {
    expect(valores(poStatusOptions({ editing: true, currentStatus: "received", savedStatus: "received" }))).toContain("received");
    const parcial = poStatusOptions({ editing: true, currentStatus: "partially_received", savedStatus: "partially_received" });
    expect(parcial.find((x) => x.value === "partially_received")?.disabled).toBe(true);
  });
});
