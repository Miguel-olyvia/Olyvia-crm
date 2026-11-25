// O navegador do novo Inventário: os caminhos clássicos do Inventário abrem o separador; o resto fica igual.
import { describe, expect, it, vi } from "vitest";
import type { Navigator } from "react-router-dom";
import { INVENTORY_PATHS } from "@/components/inventory/ui/inventoryLinks";
import { navegadorTradutor, paraSeparador, separadorDoCaminho, traduzirTo } from "./navegadorInventario";

describe("paraSeparador", () => {
  it("os nove caminhos do Inventário vão para o separador", () => {
    expect(paraSeparador(INVENTORY_PATHS.today)).toBe("/inventory/novo/hoje");
    expect(paraSeparador(INVENTORY_PATHS.purchaseOrders)).toBe("/inventory/novo/encomendas");
    expect(paraSeparador(INVENTORY_PATHS.suppliers)).toBe("/inventory/novo/fornecedores");
    expect(paraSeparador(INVENTORY_PATHS.receiving)).toBe("/inventory/novo/rececao");
    expect(paraSeparador(INVENTORY_PATHS.stocks)).toBe("/inventory/novo/existencias");
    expect(paraSeparador(INVENTORY_PATHS.stockMovements)).toBe("/inventory/novo/movimentos");
    expect(paraSeparador(INVENTORY_PATHS.stockCounts)).toBe("/inventory/novo/contagens");
    expect(paraSeparador(INVENTORY_PATHS.warehouses)).toBe("/inventory/novo/armazens");
    expect(paraSeparador(INVENTORY_PATHS.clientOrders)).toBe("/inventory/novo/saidas");
  });

  it("mantém o search e o hash", () => {
    expect(paraSeparador("/purchase-orders?open=abc&status=late")).toBe("/inventory/novo/encomendas?open=abc&status=late");
    expect(paraSeparador("/receiving?po=1#linhas")).toBe("/inventory/novo/rececao?po=1#linhas");
    expect(paraSeparador("/stocks#topo")).toBe("/inventory/novo/existencias#topo");
    expect(paraSeparador("/stocks/?q=x")).toBe("/inventory/novo/existencias?q=x");
  });

  it("os outros caminhos ficam iguais", () => {
    for (const c of ["/proposals?open=1", "/home", "/inventory/novo/hoje", "/inventory/novo/encomendas?status=pending",
      "/purchase-orders/abc", "/inventoryx", "?status=late", "relativo", "https://exemplo.pt/stocks", "/"]) {
      expect(paraSeparador(c)).toBe(c);
    }
    expect(separadorDoCaminho("/inventory/novo")).toBeNull();
  });

  it("traduz o To em objeto (o que o react-router passa ao navigator)", () => {
    expect(traduzirTo({ pathname: "/client-orders", search: "?ready=1", hash: "" })).toEqual({ pathname: "/inventory/novo/saidas", search: "?ready=1", hash: "" });
    const igual = { pathname: "/proposals", search: "?open=1" };
    expect(traduzirTo(igual)).toBe(igual);
    const soSearch = { search: "?x=1" };
    expect(traduzirTo(soSearch)).toBe(soSearch);
  });
});

describe("navegadorTradutor", () => {
  it("push, replace e createHref passam pelo separador; go fica igual; funciona sem this", () => {
    const base: Navigator = { createHref: vi.fn((to) => (typeof to === "string" ? to : `${to.pathname ?? ""}${to.search ?? ""}`)), go: vi.fn(), push: vi.fn(), replace: vi.fn() };
    const nav = navegadorTradutor(base);
    const { push, replace, createHref, go } = nav;
    push({ pathname: "/purchase-orders", search: "?open=9" }, { a: 1 }, { replace: false });
    expect(base.push).toHaveBeenCalledWith({ pathname: "/inventory/novo/encomendas", search: "?open=9" }, { a: 1 }, { replace: false });
    replace("/suppliers?filter=prices");
    expect(base.replace).toHaveBeenCalledWith("/inventory/novo/fornecedores?filter=prices", undefined, undefined);
    expect(createHref({ pathname: "/stock-counts", search: "?stalled=1" })).toBe("/inventory/novo/contagens?stalled=1");
    go(-1);
    expect(base.go).toHaveBeenCalledWith(-1);
    expect(nav.encodeLocation).toBeUndefined();
  });
});
