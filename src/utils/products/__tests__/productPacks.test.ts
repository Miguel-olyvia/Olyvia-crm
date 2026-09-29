import { describe, it, expect } from "vitest";
import {
  effectivePackQtys,
  normalizePackQty,
  packPriceFromUnit,
  packUnitCostRounding,
  supplierUnitCost,
  unitCostFromPackPrice,
  validatePackQtyInput,
} from "../productPacks";

describe("packs na ficha do produto", () => {
  it("quantidade do pack: inteiro ≥ 1, 1 por omissão", () => {
    expect(normalizePackQty(undefined)).toBe(1);
    expect(normalizePackQty("")).toBe(1);
    expect(normalizePackQty(0)).toBe(1);
    expect(normalizePackQty(-3)).toBe(1);
    expect(normalizePackQty(6)).toBe(6);
    expect(normalizePackQty("12")).toBe(12);
    expect(normalizePackQty(2.7)).toBe(2);
  });

  it("custo unitário = preço do pack ÷ N, a 2 casas", () => {
    expect(unitCostFromPackPrice(30, 6)).toBe(5);
    expect(unitCostFromPackPrice(10, 3)).toBe(3.33);
    expect(unitCostFromPackPrice(0.05, 10)).toBe(0.01);
  });

  it("N = 1 devolve o valor tal e qual (produtos sem packs)", () => {
    expect(unitCostFromPackPrice(12.345, 1)).toBe(12.345);
    expect(unitCostFromPackPrice(7.5, 0)).toBe(7.5);
  });

  it("preço do pack de venda = unitário × N", () => {
    expect(packPriceFromUnit(1.23, 10)).toBe(12.3);
    expect(packPriceFromUnit(0.1, 3)).toBe(0.3);
    expect(packPriceFromUnit(4, 1)).toBe(4);
  });

  it("sem unidade de stock não há packs; sem fornecedor a compra é à unidade", () => {
    expect(effectivePackQtys({ purchaseQty: 6, saleQty: 4, hasStockUom: false, purchaseEnabled: true }))
      .toEqual({ purchaseQty: 1, saleQty: 1 });
    expect(effectivePackQtys({ purchaseQty: 6, saleQty: 4, hasStockUom: true, purchaseEnabled: false }))
      .toEqual({ purchaseQty: 1, saleQty: 4 });
    expect(effectivePackQtys({ purchaseQty: 6, saleQty: undefined, hasStockUom: true, purchaseEnabled: true }))
      .toEqual({ purchaseQty: 6, saleQty: 1 });
  });

  it("validação de 'Compra-se em' / 'Vende-se em': vazio e 0 bloqueiam, não viram 1", () => {
    expect(validatePackQtyInput(1)).toBeNull();
    expect(validatePackQtyInput(6)).toBeNull();
    expect(validatePackQtyInput("12")).toBeNull();
    expect(validatePackQtyInput(100000)).toBeNull();
    expect(validatePackQtyInput("")).not.toBeNull();
    expect(validatePackQtyInput(undefined)).not.toBeNull();
    expect(validatePackQtyInput(null)).not.toBeNull();
    expect(validatePackQtyInput(0)).not.toBeNull();
    expect(validatePackQtyInput(NaN)).not.toBeNull();
    expect(validatePackQtyInput("abc")).not.toBeNull();
    expect(validatePackQtyInput(-2)).toBe("A quantidade mínima é 1");
    expect(validatePackQtyInput(2.5)).toBe("A quantidade deve ser um número inteiro");
    expect(validatePackQtyInput(100001)).toBe("A quantidade é demasiado elevada");
  });

  it("arredondamento do custo unitário: sem aviso quando cabe em cêntimos", () => {
    expect(packUnitCostRounding(30, 6).warning).toBeNull();
    expect(packUnitCostRounding(10, 3).warning).toBeNull(); // 3,333… → 3,33 (0,1%)
    expect(packUnitCostRounding(0.4, 100).warning).not.toBeNull();
    expect(packUnitCostRounding(0, 100).warning).toBeNull();
    expect(packUnitCostRounding(0.004, 1).warning).toBeNull(); // N = 1: grava-se tal e qual
  });

  it("arredondamento: pack/N < 0,01 que arredonda a 0 avisa que o custo não é atualizado", () => {
    const r = packUnitCostRounding(0.4, 100); // 0,004 €
    expect(r.exactUnit).toBeCloseTo(0.004, 10);
    expect(r.storedUnit).toBe(0);
    expect(r.warning).toContain("0,004 €");
    expect(r.warning).toContain("não é atualizado");
  });

  it("arredondamento: erro relativo > 1% avisa com o valor gravado", () => {
    const r = packUnitCostRounding(1.49, 100); // 0,0149 → 0,01 (−33%)
    expect(r.storedUnit).toBe(0.01);
    expect(r.warning).toContain("0,0149 €");
    expect(r.warning).toContain("fica gravado 0,01 €");
    const r2 = packUnitCostRounding(1.9, 20); // 0,095 → 0,1 (+5,3%)
    expect(r2.storedUnit).toBe(0.1);
    expect(r2.warning).not.toBeNull();
    expect(packUnitCostRounding(10.05, 10).warning).toBeNull(); // 1,005 → 1,01 (0,5%)
  });

  it("custo por unidade de stock de uma ligação em pack", () => {
    expect(supplierUnitCost(50, 10)).toBe(5);
    expect(supplierUnitCost(50, 1)).toBe(50);
    expect(supplierUnitCost(50, null)).toBe(50);
    expect(supplierUnitCost(null, 10)).toBeNull();
  });
});
