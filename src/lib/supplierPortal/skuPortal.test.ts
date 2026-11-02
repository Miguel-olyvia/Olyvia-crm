// As regras do SKU do portal têm de dar o mesmo que as da base (fn_sp_codigo_medida, fn_sp_codigo_cor; provadas na base RH a 29/10
// com estes mesmos exemplos).
import { describe, expect, it } from "vitest";
import { codigoCor, codigoMedida, skuBase, skuPrevisto } from "./skuPortal";

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

  it("regra nova: número de 4 algarismos depois da subcategoria; dá-se ao gravar", () => {
    expect(skuPrevisto("ELE", "ILU", "18x18", "Preto")).toBe("ELE-ILU-····-18X18-PRE");
    expect(skuPrevisto("ISO", null, "", "Cinza")).toBe("ISO-····-CIN");
    expect(skuPrevisto(null, "ILU", "18x18", "Preto")).toBeNull();
  });

  it("o artigo com número fica com ele quando muda a medida ou a cor", () => {
    expect(skuPrevisto("ELE", "ILU", "20x20", "Branco", "ELE-ILU-0007-18X18-PRE", true)).toBe("ELE-ILU-0007-20X20-BRA");
  });

  it("o artigo antigo fica com a regra antiga enquanto não muda de categoria", () => {
    expect(skuPrevisto("REV", "PAR", "30x60", "Branco", "REV-PAR-30X60-BRA-2", true)).toBe("REV-PAR-30X60-BRA-2");
    expect(skuPrevisto("REV", "PAR", "30x60", "Preto", "REV-PAR-30X60-BRA", true)).toBe("REV-PAR-30X60-PRE");
    expect(skuPrevisto("REV", "PAV", "30x60", "Branco", "REV-PAR-30X60-BRA", false)).toBe("REV-PAV-····-30X60-BRA");
  });
});
