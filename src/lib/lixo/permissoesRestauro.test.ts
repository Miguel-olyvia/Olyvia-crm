import { describe, expect, it } from "vitest";
import { podeRestaurar } from "./permissoesRestauro";

const com = (...codigos: string[]) => (c: string) => codigos.includes(c);

describe("Lixo: Restaurar só a quem o servidor deixa", () => {
  it("contrato: sem client_contracts.delete não aparece; com aparece", () => {
    expect(podeRestaurar("contracts", com())).toBe(false);
    expect(podeRestaurar("contracts", com("client_contracts.edit", "deals.delete"))).toBe(false);
    expect(podeRestaurar("contracts", com("client_contracts.delete"))).toBe(true);
  });

  it("encomenda de cliente: pede client_orders.delete", () => {
    expect(podeRestaurar("client_orders", com("client_contracts.delete"))).toBe(false);
    expect(podeRestaurar("client_orders", com("client_orders.delete"))).toBe(true);
  });

  it("os outros tipos ficam como estavam (o servidor não pede permissão no restauro)", () => {
    for (const t of ["clients", "leads", "deals", "quotes", "proposals"] as const) {
      expect(podeRestaurar(t, com())).toBe(true);
    }
  });
});
