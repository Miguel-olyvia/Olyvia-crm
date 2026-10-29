// As regras do SKU do portal têm de dar o mesmo que as da base (fn_sp_codigo_medida, fn_sp_codigo_cor; provadas na base RH a 29/10
// com estes mesmos exemplos).
import { describe, expect, it } from "vitest";
import { codigoCor, codigoMedida, skuBase } from "./skuPortal";

describe("SKU do artigo do fornecedor", () => {
  it("a medida fica só com números, ponto e X", () => {
    expect(codigoMedida("30 x 60 cm")).toBe("30X60");
    expect(codigoMedida("80×120")).toBe("80X120");
    expect(codigoMedida("1,5 L")).toBe("1.5");
    expect(codigoMedida("30 X 60")).toBe("30X60");
    expect(codigoMedida("")).toBe("");
  });

  it("a cor são as 3 primeiras letras da primeira palavra, sem acentos", () => {
    expect(codigoCor("Branco mate")).toBe("BRA");
    expect(codigoCor("Ébano")).toBe("EBA");
    expect(codigoCor("branco brilho")).toBe("BRA");
    expect(codigoCor(null)).toBe("");
  });

  it("junta os códigos que existem, por ordem; sem categoria não há SKU", () => {
    expect(skuBase("REV", "PAR", "30x60", "Branco")).toBe("REV-PAR-30X60-BRA");
    expect(skuBase("REV", "PAR", "30x60", "Preto")).toBe("REV-PAR-30X60-PRE");
    expect(skuBase("ISO", null, "", "Cinza")).toBe("ISO-CIN");
    expect(skuBase(null, "PAR", "30x60", "Branco")).toBeNull();
  });
});
