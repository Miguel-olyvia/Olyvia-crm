// Cálculo canónico de taxas de serviço (quote_fees) — fonte ÚNICA.
//
// Vive dentro de `supabase/functions/` para garantir empacotamento das
// Edge Functions (Deno). O frontend (Vite) também importa este ficheiro por
// path relativo. Helper puro: sem React, sem Supabase, sem Deno, sem Node.
//
// Regras 1:1 com `QuoteBuilder.calculateTotals` (não reinterpretar):
//  - SUBTOTAL.baseAmount = soma de precoSemIva (pré-desconto global).
//  - LINE_PERCENTAGE só se aplica a linhas de SERVIÇO (não products/bundles);
//    respeita `risk_fee_percent` por linha quando definido em
//    `selected_attributes`.
//  - apply_vat=false → vatAmount=0.
//  - feeVatOverrides[feeId] substitui vat_rate (e o flag de aplicar IVA passa
//    a ser override>0).
//
// A persistência (delete+insert+update das tabelas `quote_fees`/`quotes`) NÃO é
// transacional — limitação documentada em `quotes.ts` (snapshot+rollback
// best-effort). Não expor esse detalhe ao utilizador final.

export type FeeForCalc = {
  id: string;
  name?: string | null;
  calculation_type: "PERCENTAGE" | "FIXED" | string;
  percentage?: number | null;
  fixed_amount?: number | null;
  application_mode?: "SUBTOTAL" | "LINE_PERCENTAGE" | string;
  apply_vat?: boolean | null;
  vat_rate?: number | null;
};

export type LineForFees = {
  // Subtotal da linha, sem IVA, ANTES do desconto global, DEPOIS do desconto
  // de linha. Equivalente ao `precoSemIva` interno do QuoteBuilder.
  precoSemIva: number;
  // Linha é de SERVIÇO? Usado para filtrar LINE_PERCENTAGE.
  isService: boolean;
  // Override per-line de % (selected_attributes.risk_fee_percent) — só aplica
  // a fees LINE_PERCENTAGE.
  riskFeePercent?: number | null;
};

export type PerFeeBreakdown = {
  feeId: string;
  name: string | null;
  baseAmount: number;
  calculatedValue: number;
  vatRate: number;
  vatAmount: number;
  totalWithVat: number;
};

export type CalculateQuoteFeesInput = {
  lines: LineForFees[];
  selectedFeeTypes: FeeForCalc[];
  feeVatOverrides?: Record<string, number>;
};

export type CalculateQuoteFeesResult = {
  perFee: PerFeeBreakdown[];
  totalFeesWithoutVat: number;
  totalFeesVat: number;
  totalFeesWithVat: number;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function calculateQuoteFees(
  input: CalculateQuoteFeesInput,
): CalculateQuoteFeesResult {
  const lines = Array.isArray(input.lines) ? input.lines : [];
  const fees = Array.isArray(input.selectedFeeTypes) ? input.selectedFeeTypes : [];
  const overrides = input.feeVatOverrides ?? {};

  // Subtotal global (pré-desconto global, soma de todas as linhas).
  const totalSemIva = lines.reduce((s, l) => s + Number(l.precoSemIva || 0), 0);

  // Subset de linhas de serviço (paridade exacta com QuoteBuilder: serviço
  // significa service_id presente e product_id/bundle_id ausentes — o caller
  // já resolveu isto em `isService`).
  const serviceLines = lines.filter((l) => l.isService);

  const perFee: PerFeeBreakdown[] = fees.map((fee) => {
    const override = overrides[fee.id];
    const hasOverride = typeof override === "number" && !Number.isNaN(override);
    const feeApplyVat = hasOverride
      ? override > 0
      : fee.apply_vat !== false;
    const feeVatRate = hasOverride
      ? Math.max(0, override)
      : (feeApplyVat
        ? (typeof fee.vat_rate === "number" ? fee.vat_rate : 23)
        : 0);

    const isLinePct = fee.application_mode === "LINE_PERCENTAGE";
    let baseAmount: number;
    let calculatedValue: number;

    if (isLinePct) {
      const defaultPct = Number(fee.percentage || 0);
      baseAmount = serviceLines.reduce((s, l) => s + Number(l.precoSemIva || 0), 0);
      calculatedValue = serviceLines.reduce((sum, l) => {
        const raw = l.riskFeePercent;
        const pct = typeof raw === "number" && !Number.isNaN(raw) ? raw : defaultPct;
        return sum + Number(l.precoSemIva || 0) * (pct / 100);
      }, 0);
    } else {
      baseAmount = totalSemIva;
      calculatedValue = fee.calculation_type === "PERCENTAGE"
        ? baseAmount * (Number(fee.percentage || 0) / 100)
        : Number(fee.fixed_amount || 0);
    }

    const vatAmount = calculatedValue * (feeVatRate / 100);
    return {
      feeId: fee.id,
      name: fee.name ?? null,
      baseAmount,
      calculatedValue,
      vatRate: feeVatRate,
      vatAmount,
      totalWithVat: calculatedValue + vatAmount,
    };
  });

  const totalFeesWithoutVat = perFee.reduce((s, f) => s + f.calculatedValue, 0);
  const totalFeesVat = perFee.reduce((s, f) => s + f.vatAmount, 0);
  const totalFeesWithVat = perFee.reduce((s, f) => s + f.totalWithVat, 0);

  return { perFee, totalFeesWithoutVat, totalFeesVat, totalFeesWithVat };
}

// Helper de arredondamento, exposto p/ caller que persiste em quote_fees
// (numeric(12,2)). NÃO usado internamente p/ não acumular erro.
export const roundCurrency = round2;
