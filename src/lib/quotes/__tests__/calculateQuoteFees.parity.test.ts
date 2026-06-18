// Teste de paridade: o helper canónico calculateQuoteFees tem de produzir
// exactamente os mesmos números que o cálculo inline original do QuoteBuilder.
//
// Os "esperados" foram calculados manualmente a partir das fórmulas do
// QuoteBuilder antes do refactor — qualquer drift entre o helper e a UI
// quebra este teste.

import { describe, expect, it } from "vitest";
import {
  calculateQuoteFees,
  type FeeForCalc,
  type LineForFees,
} from "../../../../supabase/functions/_shared/calculateQuoteFees";

const subtotalPct: FeeForCalc = {
  id: "fee-sub-pct",
  name: "Taxa 10%",
  calculation_type: "PERCENTAGE",
  percentage: 10,
  fixed_amount: null,
  application_mode: "SUBTOTAL",
  apply_vat: true,
  vat_rate: 23,
};

const subtotalFixed: FeeForCalc = {
  id: "fee-sub-fix",
  name: "Taxa urgência",
  calculation_type: "FIXED",
  percentage: null,
  fixed_amount: 100,
  application_mode: "SUBTOTAL",
  apply_vat: false,
  vat_rate: 23,
};

const linePct: FeeForCalc = {
  id: "fee-line-pct",
  name: "Consultoria",
  calculation_type: "PERCENTAGE",
  percentage: 7,
  fixed_amount: null,
  application_mode: "LINE_PERCENTAGE",
  apply_vat: true,
  vat_rate: 6,
};

describe("calculateQuoteFees — paridade com QuoteBuilder", () => {
  it("só produtos: SUBTOTAL aplica, LINE_PERCENTAGE base=0", () => {
    const lines: LineForFees[] = [
      { precoSemIva: 1000, isService: false },
      { precoSemIva: 500, isService: false },
    ];
    const r = calculateQuoteFees({
      lines,
      selectedFeeTypes: [subtotalPct, linePct],
    });
    const sub = r.perFee.find((f) => f.feeId === "fee-sub-pct")!;
    const line = r.perFee.find((f) => f.feeId === "fee-line-pct")!;

    // SUBTOTAL: base=1500, calc=150, vat=34.5, total=184.5
    expect(sub.baseAmount).toBe(1500);
    expect(sub.calculatedValue).toBeCloseTo(150);
    expect(sub.vatAmount).toBeCloseTo(34.5);
    expect(sub.totalWithVat).toBeCloseTo(184.5);

    // LINE_PERCENTAGE: sem serviços, base=0, calc=0
    expect(line.baseAmount).toBe(0);
    expect(line.calculatedValue).toBe(0);
    expect(line.totalWithVat).toBe(0);
  });

  it("misto: LINE_PERCENTAGE só pega na linha de serviço", () => {
    const lines: LineForFees[] = [
      { precoSemIva: 1000, isService: false }, // produto
      { precoSemIva: 200, isService: true }, // serviço
      { precoSemIva: 0, isService: true }, // ignorada (zero)
    ];
    const r = calculateQuoteFees({
      lines,
      selectedFeeTypes: [subtotalPct, linePct],
    });
    const sub = r.perFee.find((f) => f.feeId === "fee-sub-pct")!;
    const line = r.perFee.find((f) => f.feeId === "fee-line-pct")!;

    // SUBTOTAL base = 1000+200+0 = 1200
    expect(sub.baseAmount).toBe(1200);
    expect(sub.calculatedValue).toBeCloseTo(120);

    // LINE_PERCENTAGE: serviços só (200+0)=200, 7% = 14, IVA 6% = 0.84
    expect(line.baseAmount).toBe(200);
    expect(line.calculatedValue).toBeCloseTo(14);
    expect(line.vatRate).toBe(6);
    expect(line.vatAmount).toBeCloseTo(0.84);
    expect(line.totalWithVat).toBeCloseTo(14.84);
  });

  it("LINE_PERCENTAGE respeita risk_fee_percent por linha", () => {
    const lines: LineForFees[] = [
      { precoSemIva: 100, isService: true, riskFeePercent: 20 }, // override
      { precoSemIva: 100, isService: true }, // usa default 7
    ];
    const r = calculateQuoteFees({
      lines,
      selectedFeeTypes: [linePct],
    });
    const line = r.perFee[0];
    // 100*0.20 + 100*0.07 = 20 + 7 = 27
    expect(line.calculatedValue).toBeCloseTo(27);
    expect(line.baseAmount).toBe(200);
  });

  it("SUBTOTAL FIXED com apply_vat=false → vatAmount=0", () => {
    const lines: LineForFees[] = [{ precoSemIva: 500, isService: false }];
    const r = calculateQuoteFees({
      lines,
      selectedFeeTypes: [subtotalFixed],
    });
    const f = r.perFee[0];
    expect(f.calculatedValue).toBe(100);
    expect(f.vatRate).toBe(0);
    expect(f.vatAmount).toBe(0);
    expect(f.totalWithVat).toBe(100);
  });

  it("feeVatOverrides substitui vat_rate (override>0)", () => {
    const lines: LineForFees[] = [{ precoSemIva: 1000, isService: false }];
    const r = calculateQuoteFees({
      lines,
      selectedFeeTypes: [subtotalPct],
      feeVatOverrides: { "fee-sub-pct": 13 },
    });
    const f = r.perFee[0];
    expect(f.calculatedValue).toBeCloseTo(100);
    expect(f.vatRate).toBe(13);
    expect(f.vatAmount).toBeCloseTo(13);
  });

  it("feeVatOverrides=0 força sem IVA mesmo com apply_vat=true", () => {
    const lines: LineForFees[] = [{ precoSemIva: 1000, isService: false }];
    const r = calculateQuoteFees({
      lines,
      selectedFeeTypes: [subtotalPct],
      feeVatOverrides: { "fee-sub-pct": 0 },
    });
    const f = r.perFee[0];
    expect(f.vatRate).toBe(0);
    expect(f.vatAmount).toBe(0);
  });

  it("totais agregados batem com a soma das fees", () => {
    const lines: LineForFees[] = [
      { precoSemIva: 1000, isService: false },
      { precoSemIva: 500, isService: true },
    ];
    const r = calculateQuoteFees({
      lines,
      selectedFeeTypes: [subtotalPct, subtotalFixed, linePct],
    });
    const sumCalc = r.perFee.reduce((s, f) => s + f.calculatedValue, 0);
    const sumVat = r.perFee.reduce((s, f) => s + f.vatAmount, 0);
    expect(r.totalFeesWithoutVat).toBeCloseTo(sumCalc);
    expect(r.totalFeesVat).toBeCloseTo(sumVat);
    expect(r.totalFeesWithVat).toBeCloseTo(sumCalc + sumVat);
  });

  it("sem fees seleccionadas → resultado vazio", () => {
    const r = calculateQuoteFees({
      lines: [{ precoSemIva: 100, isService: false }],
      selectedFeeTypes: [],
    });
    expect(r.perFee).toEqual([]);
    expect(r.totalFeesWithoutVat).toBe(0);
    expect(r.totalFeesVat).toBe(0);
    expect(r.totalFeesWithVat).toBe(0);
  });
});
