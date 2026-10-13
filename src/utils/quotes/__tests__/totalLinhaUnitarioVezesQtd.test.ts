import { describe, it, expect } from "vitest";
import { getLineDisplayUnitPrice, getLineUnitPrice, getLineSubtotal, round2 } from "../quoteLinePricing";
import { computeLineVatAmount, getLineVatLabel } from "../computeQuoteTotals";

/**
 * Regra: o preço unitário está certo; o total da linha é unitário × quantidade.
 * Num bundle, o unitário é Σ round2(componente.unit_price) × componente.quantity.
 */

const colunaDeDuche = {
  qt: 1,
  iva_percent: 23,
  retail_price_unit: null,
  selected_attributes: {
    bundle_components: [
      { name: "Mão de obra", quantity: 1, unit_price: 53.5714, vat_rate: 6 },
      { name: "Coluna", quantity: 1, unit_price: 221.0, vat_rate: 23 },
    ],
  },
};

const revestimento = {
  qt: 20,
  iva_percent: 23,
  retail_price_unit: null,
  selected_attributes: {
    bundle_components: [
      { name: "Aplicação", quantity: 1, unit_price: 35.7151, vat_rate: 6 },
      { name: "Material", quantity: 1, unit_price: 27.92, vat_rate: 23 },
    ],
  },
};

describe("total da linha = unitário × quantidade", () => {
  it("Coluna de Duche: unit 274,57, IVA Mista, total c/IVA 328,61", () => {
    expect(getLineUnitPrice(colunaDeDuche)).toBe(274.57);
    expect(getLineDisplayUnitPrice(colunaDeDuche)).toBe(274.57);
    const totalSemIva = getLineSubtotal(colunaDeDuche);
    expect(totalSemIva).toBe(274.57);
    expect(getLineVatLabel(colunaDeDuche)).toBe("Mista");
    expect(round2(totalSemIva + computeLineVatAmount(colunaDeDuche, totalSemIva))).toBe(328.61);
  });

  it("Revestimento: 20 × (35,72 + 27,92) = 1272,80", () => {
    expect(getLineDisplayUnitPrice(revestimento)).toBe(63.64);
    expect(getLineSubtotal(revestimento)).toBe(1272.8);
  });

  it("linha gravada sem bundle nem preço de venda: total ÷ qt", () => {
    expect(getLineDisplayUnitPrice({ qt: 3, total_sem_iva: 30.3 })).toBe(10.1);
    expect(getLineDisplayUnitPrice({ qt: 0, total_sem_iva: 30.3 })).toBe(0);
  });

  it("retail_price_unit manda no unitário mostrado", () => {
    expect(getLineDisplayUnitPrice({ ...revestimento, retail_price_unit: 70 })).toBe(70);
  });

  it("rótulo de IVA: taxa única, override e bundle com uma só taxa", () => {
    expect(getLineVatLabel({ iva_percent: 23 })).toBe("23%");
    expect(getLineVatLabel({ ...colunaDeDuche, selected_attributes: { ...colunaDeDuche.selected_attributes, iva_override: 6 } })).toBe("6%");
    expect(getLineVatLabel({
      iva_percent: 23,
      selected_attributes: { bundle_components: [{ name: "A", quantity: 1, unit_price: 10, vat_rate: 6 }] },
    })).toBe("6%");
  });
});
