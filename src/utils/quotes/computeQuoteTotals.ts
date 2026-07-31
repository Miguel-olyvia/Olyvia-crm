import { round2 } from '@/utils/quotes/inlineQuoteVatCalculation';
import { getBundleComponents } from '@/utils/quotes/bundleComponents';

/**
 * Pure totals calculation for a single quote's PDF rendering.
 *
 * This is a verbatim extraction of the calculation that used to live inline
 * in QuotePDFDocument.tsx (subtotal, global discount, per-rate VAT bucketing
 * with bundle-component proportional splitting, fee VAT handling). Moving it
 * here lets a multi-quote proposal PDF reuse the exact same math to compute
 * an aggregated totals block, without duplicating or drifting from the
 * single-quote logic.
 */

export interface VatRateBucket {
  rate: number;
  base: number;
  vat: number;
}

export interface FeeVatEntry {
  name: string;
  rate: number;
  vat: number;
}

export interface QuoteTotals {
  subtotalBruto: number;
  discountValue: number;
  subtotal: number;
  totalFeesValue: number;
  totalFeesValueRounded: number;
  vatBreakdown: VatRateBucket[];
  feeVatBreakdown: FeeVatEntry[];
  roundedFeeVatBreakdown: FeeVatEntry[];
  totalIva: number;
  subtotalWithFees: number;
  total: number;
}

export function computeQuoteTotals(lines: any[], fees: any[] = [], descontoPercent = 0): QuoteTotals {
  const subtotalBruto = lines.reduce((sum, line) => {
    return sum + (parseFloat(String(line.total_sem_iva || 0)));
  }, 0);

  // Apply global discount. Round the discounted subtotal to cents (matching
  // QuoteBuilder.calculateTotals' round2(totalSemIvaComDesconto)) so the PDF
  // total reconciles with the on-screen total to the cent.
  const discountFactor = descontoPercent > 0 ? (1 - descontoPercent / 100) : 1;
  const subtotal = round2(subtotalBruto * discountFactor);
  const discountValue = subtotalBruto - subtotal;

  // Calculate service fees totals
  const totalFeesValue = fees.reduce((sum, fee) => {
    return sum + parseFloat(String(fee.calculated_value || 0));
  }, 0);

  // Group VAT by rate (e.g. 6%, 23%) — apply global discount proportionally.
  // For bundle lines with components having mixed VAT, split the line base
  // proportionally by each component's subtotal and use each component's own rate.
  const vatByRateMap = new Map<number, { base: number; vat: number }>();
  lines.forEach((line) => {
    const lineBase = parseFloat(String(line.total_sem_iva || 0)) * discountFactor;
    const components = getBundleComponents(line);
    const componentsTotal = components.reduce(
      (s, c) => s + (c.unit_price * c.quantity),
      0
    );
    const ivaOverrideRaw = (line as any)?.selected_attributes?.iva_override;
    const hasOverride = typeof ivaOverrideRaw === "number" && !Number.isNaN(ivaOverrideRaw);

    if (components.length > 0 && componentsTotal > 0 && !hasOverride) {
      // Split line base across components by their share of the gross components total
      components.forEach((c) => {
        const share = (c.unit_price * c.quantity) / componentsTotal;
        const base = lineBase * share;
        const rate = c.vat_rate;
        const vat = base * (rate / 100);
        const existing = vatByRateMap.get(rate) || { base: 0, vat: 0 };
        vatByRateMap.set(rate, { base: existing.base + base, vat: existing.vat + vat });
      });
    } else {
      const rate = hasOverride ? ivaOverrideRaw : parseFloat(String(line.iva_percent || 0));
      const vat = lineBase * (rate / 100);
      const existing = vatByRateMap.get(rate) || { base: 0, vat: 0 };
      vatByRateMap.set(rate, { base: existing.base + lineBase, vat: existing.vat + vat });
    }
  });

  // Compute fee VAT: merge with product VAT bucket when same rate exists,
  // otherwise show as a separate "IVA X% (Nome)" line.
  const feeVatBreakdown: FeeVatEntry[] = [];
  fees.forEach((fee) => {
    const base = parseFloat(String(fee.calculated_value || 0));
    const storedVat = parseFloat(String(fee.vat_amount || 0));
    const rateField = parseFloat(String(fee.vat_rate ?? 0));
    const rate = rateField > 0
      ? rateField
      : (base > 0 && storedVat > 0 ? Math.round((storedVat / base) * 100) : 0);
    const vat = storedVat > 0 ? storedVat : base * (rate / 100);
    if (vat <= 0 && rate <= 0) return;
    const existing = vatByRateMap.get(rate);
    if (existing) {
      vatByRateMap.set(rate, { base: existing.base + base, vat: existing.vat + vat });
    } else {
      const name = fee.service_fee_types?.name || 'Taxa';
      feeVatBreakdown.push({ name, rate, vat });
    }
  });

  // Round each VAT-rate bucket to cents before summing (matching
  // QuoteBuilder.calculateTotals' round2(data.vat) discipline) so the total
  // matches the visual sum of the individual rows shown below.
  const vatBreakdown: VatRateBucket[] = Array.from(vatByRateMap.entries())
    .map(([rate, v]) => ({ rate, base: v.base, vat: round2(v.vat) }))
    .filter((v) => v.base > 0 || v.vat > 0)
    .sort((a, b) => a.rate - b.rate);

  const roundedFeeVatBreakdown = feeVatBreakdown.map((f) => ({ ...f, vat: round2(f.vat) }));

  const totalIva = vatBreakdown.reduce((sum, v) => sum + v.vat, 0)
    + roundedFeeVatBreakdown.reduce((sum, f) => sum + f.vat, 0);
  const totalFeesValueRounded = round2(totalFeesValue);
  const subtotalWithFees = subtotal + totalFeesValueRounded;
  const total = subtotalWithFees + totalIva;

  return {
    subtotalBruto,
    discountValue,
    subtotal,
    totalFeesValue,
    totalFeesValueRounded,
    vatBreakdown,
    feeVatBreakdown,
    roundedFeeVatBreakdown,
    totalIva,
    subtotalWithFees,
    total,
  };
}

export interface AggregatedFeeEntry {
  name: string;
  value: number;
}

export interface AggregatedTotals {
  /** Sum of every quote's subtotalBruto (pre-discount, gross product total). */
  subtotalBruto: number;
  /** Every fee from every quote, listed individually — never merged/summed by name. */
  fees: AggregatedFeeEntry[];
  /** Sum of each quote's own (post-discount subtotal + rounded fees total). */
  subtotalWithFees: number;
  /** Product VAT buckets merged by rate across all quotes' raw lines. */
  vatBreakdown: VatRateBucket[];
  /** Fee VAT entries that don't share a rate with any product bucket, rounded. */
  feeVatBreakdown: FeeVatEntry[];
  totalIva: number;
  total: number;
}

export interface QuoteTotalsInput {
  lines: any[];
  fees?: any[];
  descontoPercent?: number;
}

/**
 * Aggregate totals across multiple quotes for a merged proposal PDF.
 *
 * VAT-rate buckets are recomputed from each quote's RAW lines/fees (using
 * the same bucketing logic as computeQuoteTotals) rather than by summing
 * already-rounded per-quote VAT buckets, to avoid double-rounding drift.
 */
export function aggregateQuoteTotals(quotesData: QuoteTotalsInput[]): AggregatedTotals {
  let subtotalBruto = 0;
  let subtotalWithFees = 0;
  const fees: AggregatedFeeEntry[] = [];
  const vatByRateMap = new Map<number, { base: number; vat: number }>();
  const feeVatBreakdown: FeeVatEntry[] = [];

  quotesData.forEach(({ lines, fees: quoteFees = [], descontoPercent = 0 }) => {
    const quoteSubtotalBruto = lines.reduce(
      (sum, line) => sum + parseFloat(String(line.total_sem_iva || 0)),
      0
    );
    subtotalBruto += quoteSubtotalBruto;

    const discountFactor = descontoPercent > 0 ? (1 - descontoPercent / 100) : 1;
    const quoteSubtotal = round2(quoteSubtotalBruto * discountFactor);
    const quoteFeesTotal = round2(
      quoteFees.reduce((sum, fee) => sum + parseFloat(String(fee.calculated_value || 0)), 0)
    );
    subtotalWithFees += quoteSubtotal + quoteFeesTotal;

    quoteFees.forEach((fee) => {
      fees.push({
        name: fee.service_fee_types?.name || 'Taxa',
        value: parseFloat(String(fee.calculated_value || 0)),
      });
    });

    lines.forEach((line) => {
      const lineBase = parseFloat(String(line.total_sem_iva || 0)) * discountFactor;
      const components = getBundleComponents(line);
      const componentsTotal = components.reduce((s, c) => s + (c.unit_price * c.quantity), 0);
      const ivaOverrideRaw = (line as any)?.selected_attributes?.iva_override;
      const hasOverride = typeof ivaOverrideRaw === "number" && !Number.isNaN(ivaOverrideRaw);

      if (components.length > 0 && componentsTotal > 0 && !hasOverride) {
        components.forEach((c) => {
          const share = (c.unit_price * c.quantity) / componentsTotal;
          const base = lineBase * share;
          const rate = c.vat_rate;
          const vat = base * (rate / 100);
          const existing = vatByRateMap.get(rate) || { base: 0, vat: 0 };
          vatByRateMap.set(rate, { base: existing.base + base, vat: existing.vat + vat });
        });
      } else {
        const rate = hasOverride ? ivaOverrideRaw : parseFloat(String(line.iva_percent || 0));
        const vat = lineBase * (rate / 100);
        const existing = vatByRateMap.get(rate) || { base: 0, vat: 0 };
        vatByRateMap.set(rate, { base: existing.base + lineBase, vat: existing.vat + vat });
      }
    });

    quoteFees.forEach((fee) => {
      const base = parseFloat(String(fee.calculated_value || 0));
      const storedVat = parseFloat(String(fee.vat_amount || 0));
      const rateField = parseFloat(String(fee.vat_rate ?? 0));
      const rate = rateField > 0
        ? rateField
        : (base > 0 && storedVat > 0 ? Math.round((storedVat / base) * 100) : 0);
      const vat = storedVat > 0 ? storedVat : base * (rate / 100);
      if (vat <= 0 && rate <= 0) return;
      const existing = vatByRateMap.get(rate);
      if (existing) {
        vatByRateMap.set(rate, { base: existing.base + base, vat: existing.vat + vat });
      } else {
        const name = fee.service_fee_types?.name || 'Taxa';
        feeVatBreakdown.push({ name, rate, vat });
      }
    });
  });

  const vatBreakdown: VatRateBucket[] = Array.from(vatByRateMap.entries())
    .map(([rate, v]) => ({ rate, base: v.base, vat: round2(v.vat) }))
    .filter((v) => v.base > 0 || v.vat > 0)
    .sort((a, b) => a.rate - b.rate);

  const roundedFeeVatBreakdown = feeVatBreakdown.map((f) => ({ ...f, vat: round2(f.vat) }));

  const totalIva = vatBreakdown.reduce((sum, v) => sum + v.vat, 0)
    + roundedFeeVatBreakdown.reduce((sum, f) => sum + f.vat, 0);

  const total = subtotalWithFees + totalIva;

  return {
    subtotalBruto,
    fees,
    subtotalWithFees,
    vatBreakdown,
    feeVatBreakdown: roundedFeeVatBreakdown,
    totalIva,
    total,
  };
}
