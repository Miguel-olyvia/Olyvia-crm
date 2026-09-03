import { describe, it, expect } from "vitest";
import {
  getLineUnitPrice,
  getLineSubtotal,
  markupFromCostAndPrice,
  marginOnPrice,
  getLineMarginPercent,
  hasDefinedSalePrice,
  round2,
} from "../quoteLinePricing";

describe("preço unitário da linha", () => {
  it("usa o preço de venda definido em vez de o reconstruir do custo", () => {
    // Rodapé SPC Decorado M/L: compra 4,26 / venda 7,10.
    const line = {
      qt: 51,
      custo_material_unit: 4.26,
      custo_mao_obra_unit: 0,
      margem_percent: markupFromCostAndPrice(4.26, 7.1),
      int_percent: 0,
      discount_percent: 0,
      retail_price_unit: 7.1,
    };
    expect(getLineUnitPrice(line)).toBe(7.1);
  });

  it("o subtotal fecha ao cêntimo com o preço mostrado (o caso Q-2026-1528)", () => {
    const line = {
      qt: 51,
      custo_material_unit: 4.26,
      custo_mao_obra_unit: 0,
      margem_percent: 66.67,
      int_percent: 0,
      discount_percent: 0,
      retail_price_unit: 7.1,
    };
    expect(getLineSubtotal(line)).toBe(362.1);
    expect(getLineSubtotal(line)).toBe(round2(51 * getLineUnitPrice(line)));
  });

  it("o defeito antigo — custo fabricado 5,46 × 30% — dava 362,00 em vez de 362,10", () => {
    const antiga = {
      qt: 51,
      custo_material_unit: 5.46,
      custo_mao_obra_unit: 0,
      margem_percent: 30,
      int_percent: 0,
      discount_percent: 0,
    };
    // Sem preço de venda definido cai no cálculo por custo e markup,
    // mas o unitário é fechado ao cêntimo antes de multiplicar.
    expect(getLineUnitPrice(antiga)).toBe(7.1);
    expect(getLineSubtotal(antiga)).toBe(362.1);
  });

  it("sem preço de venda definido, calcula por custo e markup", () => {
    const line = {
      qt: 2,
      custo_material_unit: 100,
      custo_mao_obra_unit: 0,
      margem_percent: 30,
      int_percent: 0,
      discount_percent: 0,
    };
    expect(getLineUnitPrice(line)).toBe(130);
    expect(getLineSubtotal(line)).toBe(260);
  });

  it("aplica a intermediação quando não há preço de venda definido", () => {
    const line = { qt: 1, custo_material_unit: 100, custo_mao_obra_unit: 0, margem_percent: 30, int_percent: 10 };
    expect(getLineUnitPrice(line)).toBe(143);
  });

  it("soma material e mão de obra", () => {
    const line = { qt: 1, custo_material_unit: 60, custo_mao_obra_unit: 40, margem_percent: 0, int_percent: 0 };
    expect(getLineUnitPrice(line)).toBe(100);
  });

  it("um preço de venda definido a zero não faz a linha valer zero", () => {
    // QuoteBuilder criava linhas em branco com retail_price_unit: 0,
    // o que as fazia render a €0 em vez de cair no cálculo por custo.
    const line = { qt: 1, custo_material_unit: 50, custo_mao_obra_unit: 0, margem_percent: 30, int_percent: 0, retail_price_unit: 0 };
    expect(hasDefinedSalePrice(line)).toBe(false);
    expect(getLineUnitPrice(line)).toBe(65);
  });

  it("aplica o desconto da linha ao subtotal", () => {
    const line = { qt: 10, custo_material_unit: 0, custo_mao_obra_unit: 0, retail_price_unit: 5, discount_percent: 10 };
    expect(getLineSubtotal(line)).toBe(45);
  });

  it("linha sem quantidade não conta", () => {
    expect(getLineSubtotal({ qt: 0, retail_price_unit: 10 })).toBe(0);
  });

  it("aceita valores em texto, como vêm da base", () => {
    const line = { qt: "51.00", custo_material_unit: "4.26", custo_mao_obra_unit: "0.00", margem_percent: "66.67", int_percent: "0.00" };
    expect(getLineUnitPrice(line)).toBe(7.1);
    expect(getLineSubtotal(line)).toBe(362.1);
  });
});

describe("as duas definições de margem", () => {
  it("markup sobre o custo reproduz o preço de venda", () => {
    expect(markupFromCostAndPrice(4.26, 7.1)).toBe(66.67);
    expect(round2(4.26 * (1 + 66.67 / 100))).toBe(7.1);
  });

  it("margem sobre o preço é a que a ficha do produto mostra", () => {
    // (7,10 − 4,26) / 7,10 = 40,0 % — o número da ficha do produto.
    expect(marginOnPrice(4.26, 7.1)).toBe(40);
  });

  it("a linha de orçamento passa a dizer o mesmo número que a ficha do produto", () => {
    const line = {
      qt: 51,
      custo_material_unit: 4.26,
      custo_mao_obra_unit: 0,
      margem_percent: markupFromCostAndPrice(4.26, 7.1),
      int_percent: 0,
      retail_price_unit: 7.1,
    };
    expect(getLineMarginPercent(line)).toBe(40);
  });

  it("sem custo conhecido a margem é 100 %, como na ficha do produto", () => {
    expect(marginOnPrice(0, 7.1)).toBe(100);
  });

  it("markup indefinido quando falta custo ou preço", () => {
    expect(markupFromCostAndPrice(0, 7.1)).toBe(0);
    expect(markupFromCostAndPrice(4.26, 0)).toBe(0);
  });
});

describe("gravar e reabrir não pode mudar o preço", () => {
  // `retail_price_unit` não existe na base: só o custo e o markup sobrevivem.
  // Reabrir reconstrói o preço a partir deles, por isso a inversão tem de fechar.
  const reabrir = (custo: number, markup: number, int: number) =>
    getLineUnitPrice({ qt: 1, custo_material_unit: custo, margem_percent: markup, int_percent: int });

  it("repõe o preço escrito à mão numa linha sem comissão", () => {
    const custo = 5.8, preco = 7.24;
    expect(reabrir(custo, markupFromCostAndPrice(custo, preco, 0), 0)).toBe(preco);
  });

  it("repõe o preço escrito à mão numa linha COM comissão", () => {
    // Era aqui que o preço subia sozinho: a comissão era aplicada uma segunda
    // vez ao reabrir, porque não tinha sido descontada ao calcular o markup.
    const custo = 5.8, preco = 7.24, int = 15;
    expect(reabrir(custo, markupFromCostAndPrice(custo, preco, int), int)).toBe(preco);
  });

  it("um preço de venda definido não é reconstruído a partir do custo", () => {
    // O caso relatado: preço de venda 7,10 no artigo, e o orçamento mostrava
    // 7,098039 por ter refeito a conta a partir do custo e da margem.
    expect(getLineUnitPrice({ qt: 1, custo_material_unit: 5.8, margem_percent: 22.38, retail_price_unit: 7.1 })).toBe(7.1);
  });

  it("o subtotal fecha com o preço mostrado", () => {
    expect(getLineSubtotal({ qt: 51, retail_price_unit: 7.1 })).toBe(362.1);
  });
});
