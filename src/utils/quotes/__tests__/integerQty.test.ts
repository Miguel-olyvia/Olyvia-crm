import { describe, it, expect } from "vitest";
import {
  integerQtyMessage,
  isValidQtyFor,
  requiresIntegerQty,
  roundToIntegerQty,
} from "../integerQty";

describe("requiresIntegerQty", () => {
  it("é false para linhas sem produto (serviços, texto livre)", () => {
    expect(requiresIntegerQty({ hasProduct: false, baseUomCode: "un" })).toBe(false);
    expect(requiresIntegerQty({ hasProduct: false, lineUomId: "pk10" })).toBe(false);
  });

  it("é false para produtos sem unidade", () => {
    expect(requiresIntegerQty({ hasProduct: true })).toBe(false);
    expect(requiresIntegerQty({ hasProduct: true, baseUomCode: null, lineUomId: null })).toBe(false);
    expect(requiresIntegerQty({ hasProduct: true, baseUomCode: "  " })).toBe(false);
  });

  it("é true para unidades contáveis, sem olhar a maiúsculas nem espaços", () => {
    for (const code of ["un", "UN", " ea ", "pcs", "Box", "PKG"]) {
      expect(requiresIntegerQty({ hasProduct: true, baseUomCode: code })).toBe(true);
    }
  });

  it("é false para unidades mensuráveis", () => {
    for (const code of ["m²", "ml", "kg", "hora", "m", "dia"]) {
      expect(requiresIntegerQty({ hasProduct: true, baseUomCode: code })).toBe(false);
    }
  });

  it("é true quando a linha está numa embalagem, mesmo com base mensurável", () => {
    expect(requiresIntegerQty({ hasProduct: true, lineUomId: "rolo", baseUomCode: "m²" })).toBe(true);
    expect(requiresIntegerQty({ hasProduct: true, lineUomId: "pk10" })).toBe(true);
  });

  it("ignora um uom_id vazio", () => {
    expect(requiresIntegerQty({ hasProduct: true, lineUomId: "", baseUomCode: "m²" })).toBe(false);
  });
});

describe("isValidQtyFor", () => {
  it("recusa zero, negativos e não numéricos", () => {
    expect(isValidQtyFor(0, false)).toBe(false);
    expect(isValidQtyFor(-1, false)).toBe(false);
    expect(isValidQtyFor(Number.NaN, false)).toBe(false);
    expect(isValidQtyFor(0, true)).toBe(false);
  });

  it("aceita decimais quando a unidade não é contável", () => {
    expect(isValidQtyFor(1.5, false)).toBe(true);
    expect(isValidQtyFor(2, false)).toBe(true);
  });

  it("só aceita inteiros quando a unidade é contável", () => {
    expect(isValidQtyFor(2, true)).toBe(true);
    expect(isValidQtyFor(1.5, true)).toBe(false);
    expect(isValidQtyFor(0.1, true)).toBe(false);
  });
});

describe("roundToIntegerQty", () => {
  it("arredonda ao inteiro mais próximo", () => {
    expect(roundToIntegerQty(1.4)).toBe(1);
    expect(roundToIntegerQty(1.5)).toBe(2);
    expect(roundToIntegerQty(3)).toBe(3);
  });

  it("um valor positivo que daria 0 passa a 1", () => {
    expect(roundToIntegerQty(0.3)).toBe(1);
  });

  it("mantém 0 e não mexe em valores não numéricos", () => {
    expect(roundToIntegerQty(0)).toBe(0);
    expect(roundToIntegerQty(Number.NaN)).toBeNaN();
  });
});

describe("integerQtyMessage", () => {
  it("indica a linha e a unidade em maiúsculas", () => {
    expect(integerQtyMessage(3, "pk10")).toBe(
      "A quantidade da linha 3 tem de ser um número inteiro (unidade: PK10)",
    );
  });

  it("usa UN quando não há código", () => {
    expect(integerQtyMessage(1, null)).toBe(
      "A quantidade da linha 1 tem de ser um número inteiro (unidade: UN)",
    );
  });
});
