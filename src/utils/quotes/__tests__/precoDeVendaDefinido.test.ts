import { describe, it, expect } from "vitest";
import { getLineUnitPrice, getLineSubtotal, round2 } from "../quoteLinePricing";
import { computeQuoteTotals, aggregateQuoteTotals } from "../computeQuoteTotals";

/**
 * O PREÇO DE VENDA DEFINIDO tem de sobreviver a gravar e reimprimir.
 *
 * O caso real: um bundle com dois componentes, 35,71 (IVA 6%) e 27,92 (IVA 23%).
 * A soma verdadeira é 63,63. O caminho antigo deitava o preço fora e guardava
 * um custo derivado ao contrário numa coluna de duas casas —
 *   63,63 / 1,30 = 48,946154… -> grava 48,95 -> × 1,30 = 63,635 -> imprime 63,64
 * — e com 5 unidades o subtotal saía 318,20 em vez de 318,15.
 *
 * Como o preço é sempre custo × 1,30 e o custo só tem cêntimos, o preço só
 * consegue aterrar em múltiplos de 1,3 cêntimos: cerca de um em cada quatro
 * preços ao cêntimo é impossível de representar por essa via.
 */

const COMPONENTE_A = { name: "Componente A", quantity: 1, unit_price: 35.71, vat_rate: 6 };
const COMPONENTE_B = { name: "Componente B", quantity: 1, unit_price: 27.92, vat_rate: 23 };
const PRECO_BUNDLE = round2(COMPONENTE_A.unit_price + COMPONENTE_B.unit_price); // 63.63

/** A linha tal como é gravada e relida: o preço de venda definido vai junto. */
const linhaGravada = (retailPriceUnit: number | null) => ({
  qt: 5,
  // O custo derivado ao contrário, exactamente como a coluna numeric(10,2) o guarda.
  custo_material_unit: 48.95,
  custo_mao_obra_unit: 0,
  margem_percent: 30,
  int_percent: 0,
  discount_percent: 0,
  iva_percent: 23,
  retail_price_unit: retailPriceUnit,
  selected_attributes: { bundle_components: [COMPONENTE_A, COMPONENTE_B] },
});

/** A coluna é numeric(10,2): é isto que a base faz ao valor à entrada. */
const comoABaseGuarda = (n: number) => round2(n);

describe("preço de venda definido: do bundle ao subtotal impresso", () => {
  it("a soma dos componentes é 63,63 e é esse o preço unitário", () => {
    expect(PRECO_BUNDLE).toBe(63.63);
    expect(getLineUnitPrice(linhaGravada(PRECO_BUNDLE))).toBe(63.63);
  });

  it("o subtotal de 5 unidades é 318,15", () => {
    expect(getLineSubtotal(linhaGravada(PRECO_BUNDLE))).toBe(318.15);
  });

  it("sem preço de venda gravado, o preço reconstruído do custo erra por cêntimos", () => {
    // Este é o defeito, fixado aqui para que não volte sem dar erro:
    // 48,95 × 1,30 = 63,635 -> 63,64, e 5 × 63,64 = 318,20.
    const semPreco = linhaGravada(null);
    expect(getLineUnitPrice(semPreco)).toBe(63.64);
    expect(getLineSubtotal(semPreco)).toBe(318.2);
  });

  it("o valor sobrevive à ida e volta pela coluna numeric(10,2)", () => {
    const gravado = comoABaseGuarda(PRECO_BUNDLE);
    expect(gravado).toBe(63.63);
    expect(getLineUnitPrice(linhaGravada(gravado))).toBe(63.63);
    expect(getLineSubtotal(linhaGravada(gravado))).toBe(318.15);
  });

  it("o subtotal impresso pelo PDF é 318,15 e não 318,20", () => {
    const linha = linhaGravada(PRECO_BUNDLE);
    const totalSemIva = getLineSubtotal(linha);
    const totais = computeQuoteTotals([{ ...linha, total_sem_iva: totalSemIva }], [], 0);

    expect(totais.subtotalBruto).toBe(318.15);
    expect(totais.subtotal).toBe(318.15);
    expect(totais.subtotal).not.toBe(318.2);
  });

  it("o IVA sai repartido pelas taxas reais dos componentes (6% e 23%)", () => {
    const linha = linhaGravada(PRECO_BUNDLE);
    const totais = computeQuoteTotals([{ ...linha, total_sem_iva: getLineSubtotal(linha) }], [], 0);

    const base6 = 318.15 * ((35.71 * 1) / 63.63);
    const base23 = 318.15 * ((27.92 * 1) / 63.63);
    const bucket6 = totais.vatBreakdown.find((v) => v.rate === 6);
    const bucket23 = totais.vatBreakdown.find((v) => v.rate === 23);

    expect(bucket6?.base).toBeCloseTo(base6, 2);
    expect(bucket23?.base).toBeCloseTo(base23, 2);
    expect(bucket6!.base + bucket23!.base).toBeCloseTo(318.15, 2);
    expect(totais.totalIva).toBeCloseTo(round2(base6 * 0.06) + round2(base23 * 0.23), 2);
  });

  it("o agregado da proposta também soma 318,15", () => {
    const linha = linhaGravada(PRECO_BUNDLE);
    const totais = aggregateQuoteTotals([
      { lines: [{ ...linha, total_sem_iva: getLineSubtotal(linha) }], fees: [], descontoPercent: 0 },
    ]);

    expect(totais.subtotalBruto).toBe(318.15);
    expect(totais.subtotalWithFees).toBe(318.15);
  });
});

describe("preços ao cêntimo que o caminho antigo não conseguia representar", () => {
  // Com preço = custo × 1,30 e o custo fechado ao cêntimo, o preço só pode
  // cair em múltiplos de 1,3 cêntimos. Com preço de venda definido, qualquer
  // cêntimo é representável.
  const precos = [63.63, 10.01, 10.02, 99.99, 0.01, 1234.57];

  it.each(precos)("%s é gravado e relido exactamente", (preco) => {
    const linha = { qt: 1, custo_material_unit: round2(preco / 1.3), margem_percent: 30, retail_price_unit: comoABaseGuarda(preco) };
    expect(getLineUnitPrice(linha)).toBe(preco);
  });

  it("sem preço de venda definido, a maior parte destes preços não fecha", () => {
    const falham = precos.filter((preco) => {
      const custo = round2(preco / 1.3);
      return getLineUnitPrice({ qt: 1, custo_material_unit: custo, margem_percent: 30 }) !== preco;
    });
    expect(falham.length).toBeGreaterThan(0);
  });
});

describe("o limite conhecido: a coluna só tem duas casas", () => {
  it("um preço com milésimos é arredondado ao gravar", () => {
    // Confirmado ao vivo contra o remoto: gravar 63,635 em
    // quote_lines.retail_price_unit (numeric(10,2)) devolve 63,64.
    expect(comoABaseGuarda(63.635)).toBe(63.64);
    expect(getLineUnitPrice({ qt: 1, retail_price_unit: comoABaseGuarda(63.635) })).toBe(63.64);
  });
});
