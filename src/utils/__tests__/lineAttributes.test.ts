import { describe, it, expect } from "vitest";
import { getDisplayAttributes } from "../lineAttributes";

describe("getDisplayAttributes", () => {
  it("devolve vazio para valores que não são objetos", () => {
    expect(getDisplayAttributes(null)).toEqual([]);
    expect(getDisplayAttributes(undefined)).toEqual([]);
    expect(getDisplayAttributes("x")).toEqual([]);
    expect(getDisplayAttributes([1, 2])).toEqual([]);
    expect(getDisplayAttributes({})).toEqual([]);
  });

  it("apresenta um atributo no formato do contrato (label + value)", () => {
    const attrs = {
      "78a954ea-f7a1-4ef1-95ad-deedbc3dd313": {
        label: "Cor de Móveis de Cozinha",
        value: "CINZA CLARO - T009",
        value_type: "list",
        price_impact: 0,
        pricing_type: "none",
        attribute_code: "Cor de Móveis de Cozinha",
      },
    };
    expect(getDisplayAttributes(attrs)).toEqual([
      {
        key: "78a954ea-f7a1-4ef1-95ad-deedbc3dd313",
        label: "Cor de Móveis de Cozinha",
        text: "CINZA CLARO - T009",
      },
    ]);
  });

  it("acrescenta a unidade quando existe", () => {
    const attrs = {
      a1: { label: "Medida ", value: "170x70x41", unit: "cm", value_type: "number" },
    };
    expect(getDisplayAttributes(attrs)).toEqual([
      { key: "a1", label: "Medida", text: "170x70x41 cm" },
    ]);
  });

  it("ignora bundle_components (estrutura interna com sku e unit_price)", () => {
    const attrs = {
      bundle_components: [
        { id: "x_y", sku: "MOIBDXXL", name: "Instalação", unit_price: 107.14, vat_rate: 6 },
      ],
    };
    expect(getDisplayAttributes(attrs)).toEqual([]);
  });

  it("ignora escalares de configuração interna como iva_override", () => {
    expect(getDisplayAttributes({ iva_override: 23, risk_fee_percent: 5 })).toEqual([]);
  });

  it("nunca produz JSON em bruto para objetos sem value legível", () => {
    const attrs = {
      a: { foo: { bar: 1 } },
      b: { label: "Cor", value: { nested: true } },
      c: { label: "Cor", value: "" },
      d: { label: "   ", value: "Branco" },
      e: { value: "Branco" },
    };
    const out = getDisplayAttributes(attrs);
    expect(out).toEqual([]);
    expect(JSON.stringify(out)).not.toContain("nested");
  });

  it("usa attribute_code quando não há label", () => {
    expect(getDisplayAttributes({ a: { attribute_code: "COR", value: "Branco" } })).toEqual([
      { key: "a", label: "COR", text: "Branco" },
    ]);
  });

  it("formata números e booleanos de forma legível", () => {
    expect(getDisplayAttributes({ a: { label: "Portas", value: 3 } })[0].text).toBe("3");
    expect(getDisplayAttributes({ a: { label: "Puxador", value: true } })[0].text).toBe("Sim");
    expect(getDisplayAttributes({ a: { label: "Puxador", value: false } })[0].text).toBe("Não");
    expect(getDisplayAttributes({ a: { label: "X", value: Number.NaN } })).toEqual([]);
  });

  it("mistura real: mantém o atributo legítimo e descarta o resto", () => {
    const attrs = {
      bundle_components: [{ sku: "A", unit_price: 10 }],
      iva_override: 6,
      "78a954ea-f7a1-4ef1-95ad-deedbc3dd313": { label: "Cor", value: "Branco" },
    };
    expect(getDisplayAttributes(attrs)).toEqual([
      { key: "78a954ea-f7a1-4ef1-95ad-deedbc3dd313", label: "Cor", text: "Branco" },
    ]);
  });
});
