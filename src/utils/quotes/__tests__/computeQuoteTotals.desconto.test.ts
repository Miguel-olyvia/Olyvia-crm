import { describe, it, expect } from "vitest";
import { aggregateQuoteTotals } from "../computeQuoteTotals";

// O desconto global de uma proposta desapareceu do PDF quando os totais
// passaram a ser agregados entre vários orçamentos: o agregado não trazia
// nenhum valor de desconto para desenhar. Estes testes fixam o contrato.

const linha = (totalSemIva: number, ivaPercent = 23) => ({
  total_sem_iva: totalSemIva,
  iva_percent: ivaPercent,
});

describe("desconto global no agregado da proposta", () => {
  it("um só orçamento a 2%: traz o valor do desconto e a percentagem", () => {
    // Números reais de uma proposta do utilizador: Subtotal Produtos
    // €17076.08 e SUBTOTAL €16734.56 — uma diferença de €341.52.
    const totals = aggregateQuoteTotals([
      { lines: [linha(17076.08)], fees: [], descontoPercent: 2 },
    ]);

    expect(totals.subtotalBruto).toBeCloseTo(17076.08, 2);
    expect(totals.subtotalWithFees).toBeCloseTo(16734.56, 2);
    expect(totals.discountValue).toBe(341.52);
    expect(totals.discountPercent).toBe(2);
  });

  it("dois orçamentos ambos a 5%: soma os valores e mantém a percentagem", () => {
    const totals = aggregateQuoteTotals([
      { lines: [linha(1000)], fees: [], descontoPercent: 5 },
      { lines: [linha(2000)], fees: [], descontoPercent: 5 },
    ]);

    expect(totals.discountValue).toBe(150);
    expect(totals.discountPercent).toBe(5);
  });

  it("dois orçamentos com percentagens diferentes: soma o valor, sem percentagem", () => {
    const totals = aggregateQuoteTotals([
      { lines: [linha(1000)], fees: [], descontoPercent: 5 },
      { lines: [linha(2000)], fees: [], descontoPercent: 2 },
    ]);

    // 50 + 40 — o valor continua certo, mas não existe uma percentagem única.
    expect(totals.discountValue).toBe(90);
    expect(totals.discountPercent).toBeNull();
  });

  it("sem desconto nenhum: nada para mostrar", () => {
    const totals = aggregateQuoteTotals([
      { lines: [linha(1000)], fees: [] },
      { lines: [linha(2000)], fees: [], descontoPercent: 0 },
    ]);

    expect(totals.discountValue).toBe(0);
    expect(totals.discountPercent).toBeNull();
  });
});
