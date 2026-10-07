import { describe, expect, it, vi } from "vitest";

const rows: { price: number; currency: string }[] = [];
vi.mock("@/integrations/supabase/client", () => {
  const q: Record<string, unknown> = {};
  ["select", "eq"].forEach((m) => { q[m] = () => q; });
  (q as { then: unknown }).then = (res: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(res);
  return { supabase: { from: () => q } };
});

import { shownAfterAccept, syncFormAfterAcceptedPrice, type OpenedPurchase, type PurchaseShown } from "../pendingSupplierPrice";

// Simula o estado da ficha (Products.tsx): o formulário e openedPurchase, e o
// que "Atualizar Produto" enviaria em product_prices.purchase.
function fakeForm(opened: OpenedPurchase, formPurchase: number) {
  const state = { opened, form: formPurchase };
  const apply = (prevShown: number, next: PurchaseShown) => {
    state.opened = { ...state.opened, price: next.displayed, storedUnit: next.storedUnit };
    if (state.form === prevShown) state.form = next.displayed;
  };
  // Products.tsx handleSubmit (sem packs): não tocada → storedUnit; tocada → campo.
  const purchaseSent = () => (state.form !== state.opened.price ? state.form : state.opened.storedUnit);
  return { state, apply, purchaseSent };
}

const accepted = (over: Partial<Parameters<typeof shownAfterAccept>[1][number]> = {}) => [{
  productCostUpdated: true,
  newUnitCost: 12,
  newPrice: 12,
  itemSupplierUpdated: true,
  isPreferred: true,
  ...over,
}];

describe("ficha do produto depois de aceitar um preço do fornecedor", () => {
  it("campo não tocado: passa ao custo aceite e gravar NÃO desfaz", async () => {
    rows.splice(0, rows.length, { price: 12, currency: "EUR" });
    const f = fakeForm({ price: 10, qty: 1, uomId: null, storedUnit: 10 }, 10);
    const warn = await syncFormAfterAcceptedPrice({
      productId: "p-1", currency: "EUR", opened: f.state.opened, formPurchase: 10,
      accepted: accepted(), loadPreferredPackPrice: async () => null, apply: f.apply, isCurrent: () => true,
    });
    expect(warn).toBeNull();
    expect(f.state.form).toBe(12);
    expect(f.purchaseSent()).toBe(12);
  });

  it("campo tocado pelo utilizador: fica o dele, com aviso", async () => {
    rows.splice(0, rows.length, { price: 12, currency: "EUR" });
    const f = fakeForm({ price: 10, qty: 1, uomId: null, storedUnit: 10 }, 11);
    const warn = await syncFormAfterAcceptedPrice({
      productId: "p-1", currency: "EUR", opened: f.state.opened, formPurchase: 11,
      accepted: accepted(), loadPreferredPackPrice: async () => null, apply: f.apply, isCurrent: () => true,
    });
    expect(f.state.form).toBe(11);
    expect(f.state.opened.storedUnit).toBe(12);
    expect(warn).toContain("Atualizar Produto");
  });

  it("não preferencial: o custo não muda e nada se mexe na ficha", async () => {
    rows.splice(0, rows.length, { price: 10, currency: "EUR" });
    const f = fakeForm({ price: 10, qty: 1, uomId: null, storedUnit: 10 }, 10);
    await syncFormAfterAcceptedPrice({
      productId: "p-1", currency: "EUR", opened: f.state.opened, formPurchase: 10,
      accepted: accepted({ productCostUpdated: false, newUnitCost: null, isPreferred: false }),
      loadPreferredPackPrice: async () => null, apply: f.apply, isCurrent: () => true,
    });
    expect(f.state.form).toBe(10);
    expect(f.purchaseSent()).toBe(10);
  });

  it("compra em pack: mostra o preço do pack novo e guarda o unitário novo", () => {
    expect(shownAfterAccept({ price: 60, qty: 10, uomId: "u", storedUnit: 6 }, accepted({ newPrice: 66, newUnitCost: 6.6 })))
      .toEqual({ displayed: 66, storedUnit: 6.6 });
  });

  it("ficha já fechada: não toca em nada", async () => {
    const apply = vi.fn();
    await syncFormAfterAcceptedPrice({
      productId: "p-1", currency: "EUR", opened: { price: 10, qty: 1, uomId: null, storedUnit: 10 }, formPurchase: 10,
      accepted: accepted(), loadPreferredPackPrice: async () => null, apply, isCurrent: () => false,
    });
    expect(apply).not.toHaveBeenCalled();
  });
});
