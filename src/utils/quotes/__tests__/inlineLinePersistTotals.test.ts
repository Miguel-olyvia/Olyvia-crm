import { describe, it, expect } from "vitest";
import { computeInlineLinePersistTotals } from "../inlineLinePersistTotals";
import { computeLineVatBuckets } from "../computeQuoteTotals";
import { round2 } from "../quoteLinePricing";

const bundle = {
  qt: 1,
  iva_percent: 23,
  retail_price_unit: null,
  discount_percent: 0,
  selected_attributes: {
    bundle_components: [
      { name: "Mão de obra", quantity: 1, unit_price: 53.57, vat_rate: 6 },
      { name: "Material", quantity: 1, unit_price: 221.0, vat_rate: 23 },
    ],
  },
};

describe("criar proposta: totais da linha inline", () => {
  it("bundle 53,57 a 6% + 221,00 a 23% → 274,57 s/IVA, IVA 54,04, 328,61 c/IVA", () => {
    const t = computeInlineLinePersistTotals(bundle, 0);
    expect(t.total_sem_iva).toBe(274.57);
    const buckets = computeLineVatBuckets(bundle, t.total_sem_iva).map((b) => round2(b.vat));
    expect(buckets).toEqual([3.21, 50.83]);
    expect(round2(t.total_com_iva - t.total_sem_iva)).toBe(54.04);
    expect(t.total_com_iva).toBe(328.61);
    expect(t.total_com_desconto).toBe(328.61);
    // Antes: 274,57 × 23% para a linha inteira = 337,72.
    expect(t.total_com_iva).not.toBe(round2(274.57 * 1.23));
  });

  it("desconto global aplicado e arredondado ao cêntimo", () => {
    expect(computeInlineLinePersistTotals(bundle, 10).total_com_desconto).toBe(295.75);
  });

  it("iva_override manda sobre os componentes", () => {
    const t = computeInlineLinePersistTotals(
      { ...bundle, selected_attributes: { ...bundle.selected_attributes, iva_override: 6 } },
      0,
    );
    expect(t.total_com_iva).toBe(291.04);
  });

  it("linha simples usa iva_percent", () => {
    const t = computeInlineLinePersistTotals(
      { qt: 3, iva_percent: 23, retail_price_unit: 10.1, discount_percent: 0 },
      0,
    );
    expect(t.total_sem_iva).toBe(30.3);
    expect(t.total_com_iva).toBe(37.27);
  });
});
