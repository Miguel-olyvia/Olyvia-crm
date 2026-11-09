import { describe, expect, it } from "vitest";
import { podeRestaurar, PERMISSAO_RESTAURAR, type TipoLixo } from "./permissoesRestauro";

const com = (...codigos: string[]) => (c: string) => codigos.includes(c);

describe("Lixo: Restaurar só a quem o servidor deixa (a permissão de apagar de cada tipo)", () => {
  const casos: [TipoLixo, string][] = [
    ["clients", "clients.delete"],
    ["leads", "leads.delete"],
    ["deals", "deals.delete"],
    ["quotes", "quotes.delete"],
    ["proposals", "proposals.delete"],
    ["contracts", "client_contracts.delete"],
    ["client_orders", "client_orders.delete"],
  ];

  it.each(casos)("%s pede %s", (tipo, codigo) => {
    expect(PERMISSAO_RESTAURAR[tipo]).toBe(codigo);
    expect(podeRestaurar(tipo, com())).toBe(false);
    expect(podeRestaurar(tipo, com(codigo))).toBe(true);
  });

  it("editar não chega", () => {
    expect(podeRestaurar("proposals", com("proposals.edit", "deals.delete"))).toBe(false);
    expect(podeRestaurar("contracts", com("client_contracts.edit"))).toBe(false);
    expect(podeRestaurar("clients", com("leads.delete"))).toBe(false);
  });
});
