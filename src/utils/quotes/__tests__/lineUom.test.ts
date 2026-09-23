import { describe, it, expect } from "vitest";
import {
  applyUomOptionToLine,
  buildLineUomOptions,
  clearLineUom,
  formatOrderLineQuantity,
  formatPackBreakdown,
  getLineUnitsPerUom,
  setLineBasePrices,
  type LineUomFields,
  type UomCatalogRow,
} from "../lineUom";
import { getLineSubtotal, getLineUnitCost, getLineUnitPrice } from "../quoteLinePricing";

const UOMS: UomCatalogRow[] = [
  { id: "un", code: "un", description: "Unidade", base_uom_id: null, conversion_factor: null },
  { id: "pk10", code: "PK10", description: "Pack 10", base_uom_id: "un", conversion_factor: 10 },
  { id: "cx50", code: "CX50", description: "Caixa 50", base_uom_id: "un", conversion_factor: 50 },
  { id: "m2", code: "m²", description: "Metro quadrado", base_uom_id: null, conversion_factor: null },
  { id: "rolo", code: "ROLO", description: "Rolo 5 m²", base_uom_id: "m2", conversion_factor: 5 },
];

type FixtureLine = LineUomFields & {
  qt: number;
  unidade: string | null;
  custo_material_unit: number;
  custo_mao_obra_unit: number;
  cost_price: number;
  retail_price_unit?: number;
  margem_percent: number;
  int_percent: number;
  discount_percent: number;
};

const baseLine = (): FixtureLine => ({
  qt: 2,
  unidade: "un" as string | null,
  custo_material_unit: 1.1,
  custo_mao_obra_unit: 0,
  cost_price: 1.1,
  retail_price_unit: 1.23,
  margem_percent: 11.82,
  int_percent: 0,
  discount_percent: 0,
  uom_id: null as string | null,
});

describe("opções de unidade de um produto", () => {
  it("unidade do produto primeiro, depois as embalagens dela por fator", () => {
    const options = buildLineUomOptions("un", UOMS);
    expect(options.map((o) => o.code)).toEqual(["un", "PK10", "CX50"]);
    expect(options[0]).toMatchObject({ isBase: true, factor: 1 });
    expect(options[1]).toMatchObject({ isBase: false, factor: 10 });
  });

  it("não mistura embalagens de outra unidade base", () => {
    expect(buildLineUomOptions("m2", UOMS).map((o) => o.code)).toEqual(["m²", "ROLO"]);
  });

  it("produto sem unidade => sem opções", () => {
    expect(buildLineUomOptions(null, UOMS)).toEqual([]);
  });
});

describe("trocar a unidade da linha", () => {
  const [un, pk10, cx50] = buildLineUomOptions("un", UOMS);

  it("embalagem: preço e custo = valor base × fator, unidade = código", () => {
    const line = applyUomOptionToLine(baseLine(), pk10);
    expect(line.uom_id).toBe("pk10");
    expect(line.units_per_uom).toBe(10);
    expect(line.unidade).toBe("PK10");
    expect(line.retail_price_unit).toBe(12.3);
    expect(line.custo_material_unit).toBe(11);
    expect(line.cost_price).toBe(11);
    // A margem (markup) não muda: custo e preço escalam juntos.
    expect(line.margem_percent).toBe(11.82);
    expect(getLineSubtotal(line)).toBe(24.6);
  });

  it("voltar à unidade base repõe os valores exatos", () => {
    const back = applyUomOptionToLine(applyUomOptionToLine(baseLine(), cx50), un);
    expect(back.uom_id).toBeNull();
    expect(back.units_per_uom).toBe(1);
    expect(back.unidade).toBe("un");
    expect(back.retail_price_unit).toBe(1.23);
    expect(back.custo_material_unit).toBe(1.1);
  });

  it("de embalagem para embalagem converte pelo rácio dos fatores", () => {
    const line = applyUomOptionToLine(applyUomOptionToLine(baseLine(), pk10), cx50);
    expect(line.retail_price_unit).toBe(61.5);
    expect(line.custo_material_unit).toBe(55);
  });

  it("cenário A: preço NULL → pack → preço à mão → base divide pelo fator", () => {
    const noRetail = { ...baseLine(), retail_price_unit: undefined as number | undefined };
    const inPack = applyUomOptionToLine(noRetail, pk10);
    expect(inPack.retail_price_unit).toBeUndefined();
    const typed = { ...inPack, retail_price_unit: 95 };
    const back = applyUomOptionToLine(typed, un);
    expect(back.retail_price_unit).toBe(9.5);
    expect(back.custo_material_unit).toBe(1.1);
  });

  it("cenário B: desconto escrito no pack é preservado proporcionalmente", () => {
    const inPack = { ...applyUomOptionToLine({ ...baseLine(), retail_price_unit: 10 }, pk10), retail_price_unit: 90 };
    expect(applyUomOptionToLine(inPack, un).retail_price_unit).toBe(9);
    expect(applyUomOptionToLine(inPack, cx50).retail_price_unit).toBe(450);
  });

  it("PK10 → PK20: preço e custo duplicam juntos (a margem mantém-se)", () => {
    const pk20 = { id: "pk20", code: "PK20", description: null, factor: 20, isBase: false };
    const inPk10 = applyUomOptionToLine(baseLine(), pk10);
    const inPk20 = applyUomOptionToLine(inPk10, pk20);
    expect(inPk20.retail_price_unit).toBe(24.6);
    expect(inPk20.custo_material_unit).toBe(22);
    expect(inPk20.cost_price).toBe(22);
    expect(inPk20.margem_percent).toBe(inPk10.margem_percent);
  });

  it("preço null mantém-se null ao trocar de unidade", () => {
    const line = { ...baseLine(), retail_price_unit: null as unknown as number };
    const inPack = applyUomOptionToLine(line, pk10);
    expect(inPack.retail_price_unit).toBeNull();
    expect(applyUomOptionToLine(inPack, un).retail_price_unit).toBeNull();
  });

  it("custo abaixo do cêntimo não se perde na ida e volta", () => {
    const line = { ...baseLine(), custo_material_unit: 0.0345 };
    const back = applyUomOptionToLine(applyUomOptionToLine(line, pk10), un);
    expect(back.custo_material_unit).toBe(0.0345);
  });

  it("linha gravada numa embalagem deriva a base pelo fator gravado", () => {
    const saved = { ...baseLine(), uom_id: "pk10", units_per_uom: 10, unidade: "PK10", retail_price_unit: 12.3, custo_material_unit: 11, cost_price: 11 };
    const back = applyUomOptionToLine(saved, un);
    expect(back.retail_price_unit).toBe(1.23);
    expect(back.custo_material_unit).toBe(1.1);
  });

  it("linha sem preço de venda definido: o preço segue o custo × fator", () => {
    const noRetail = { ...baseLine(), retail_price_unit: undefined as number | undefined, margem_percent: 30 };
    const before = getLineUnitPrice(noRetail);
    const line = applyUomOptionToLine(noRetail, pk10);
    expect(line.retail_price_unit).toBeUndefined();
    expect(getLineUnitCost(line)).toBe(11);
    expect(getLineUnitPrice(line)).toBeCloseTo(before * 10, 1);
  });

  it("só escala os campos indicados (encomenda manual: unit_price)", () => {
    const item = { unit_price: 2.5, quantity: 3, uom_id: null as string | null };
    const next = applyUomOptionToLine(item, pk10, ["unit_price"]);
    expect(next.unit_price).toBe(25);
    expect(next.quantity).toBe(3);
  });

  it("sem ruído de vírgula flutuante", () => {
    const line = applyUomOptionToLine({ ...baseLine(), retail_price_unit: 0.1 }, { ...pk10, factor: 3 });
    expect(line.retail_price_unit).toBe(0.3);
  });

  it("recálculo por atributos numa embalagem grava valor base × fator", () => {
    const inPack = applyUomOptionToLine(baseLine(), pk10);
    const updated = setLineBasePrices(inPack, { retail_price_unit: 2, custo_material_unit: 1.5 });
    expect(updated.retail_price_unit).toBe(20);
    expect(updated.custo_material_unit).toBe(15);
    const back = applyUomOptionToLine(updated, un);
    expect(back.retail_price_unit).toBe(2);
    expect(back.custo_material_unit).toBe(1.5);
    expect(back.cost_price).toBe(1.1);
  });

  it("setLineBasePrices na unidade base é um set direto", () => {
    const updated = setLineBasePrices(baseLine(), { retail_price_unit: 2 });
    expect(updated.retail_price_unit).toBe(2);
  });

  it("clearLineUom volta a fator 1", () => {
    const cleared = clearLineUom(applyUomOptionToLine(baseLine(), pk10));
    expect(cleared.uom_id).toBeNull();
    expect(getLineUnitsPerUom(cleared)).toBe(1);
  });
});

describe("textos de quantidade", () => {
  it("2 × PK10 = 20 un", () => {
    expect(formatPackBreakdown(2, "PK10", 10, "un")).toBe("2 × PK10 = 20 un");
    expect(formatPackBreakdown(2, "un", 1, "un")).toBeNull();
  });

  it("linha da encomenda de cliente: quantidade da linha + equivalência em stock", () => {
    expect(formatOrderLineQuantity({ quantity: 20, line_quantity: 2, unidade: "PK10", units_per_uom: 10, stock_unidade: "un" }))
      .toEqual({ main: "2 PK10", stock: "= 20 un" });
    expect(formatOrderLineQuantity({ quantity: 3, line_quantity: 3, unidade: "un", units_per_uom: 1 }))
      .toEqual({ main: "3 un", stock: null });
    // RPC antiga (sem as chaves novas): como hoje.
    expect(formatOrderLineQuantity({ quantity: 4 })).toEqual({ main: "4", stock: null });
  });
});
