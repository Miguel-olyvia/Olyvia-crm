import type { InlineQuoteData, InlineQuoteLine } from "@/components/proposals/InlineQuoteBuilder";

export interface VatBreakdownEntry {
  rate: number;
  base: number;
  vat: number;
}

export interface InlineQuoteCalcResult {
  /** Raw sum of all line totals (s/IVA), before the quote's global discount. */
  totalSemIva: number;
  /** totalSemIva after applying the quote's global discount (unrounded). */
  totalSemIvaComDesconto: number;
  /** Sum of VAT across all rate buckets, each bucket rounded to cents before summing. */
  totalIva: number;
  /** round2(totalSemIvaComDesconto) + totalIva — the quote's grand total. */
  totalComIva: number;
  /** Alias of totalComIva, kept for backwards-compatible call sites. */
  totalComDesconto: number;
  /** VAT broken down by rate, sorted descending by rate. */
  vatBreakdown: VatBreakdownEntry[];
}

export const round2 = (n: number): number => Math.round(n * 100) / 100;

// Extract bundle components from a quote line, regardless of where they live
// (top-level, selected_attributes, or selected_attributes.bundle_components_data).
export function getLineBundleComponents(line: any): any[] {
  if (Array.isArray(line?.bundle_components)) return line.bundle_components;
  if (Array.isArray(line?.selected_attributes?.bundle_components)) return line.selected_attributes.bundle_components;
  if (Array.isArray(line?.selected_attributes?.bundle_components_data)) return line.selected_attributes.bundle_components_data;
  return [];
}

/**
 * Calculate totals for an inline quote, splitting bundle component VAT
 * across each component's own rate instead of using the line's single
 * `iva_percent` for the whole line. This is the single source of truth for
 * inline-quote VAT math — used by both InlineQuoteBuilder's own header/totals
 * and QuoteBuilderSidebar's consolidated totals, so they can never disagree.
 */
export function calculateInlineQuoteTotals(iq: Pick<InlineQuoteData, "lines" | "desconto_global_percent">): InlineQuoteCalcResult {
  let totalSemIva = 0;
  const vatByRate: Record<number, { base: number; vat: number }> = {};

  iq.lines.filter((l: InlineQuoteLine) => l.qt > 0).forEach((line: InlineQuoteLine) => {
    const custoUnit = line.custo_material_unit + line.custo_mao_obra_unit;
    const isManual = custoUnit === 0 && line.retail_price_unit != null;
    const unitPrice = isManual
      ? (line.retail_price_unit || 0)
      : custoUnit * (1 + line.margem_percent / 100) * (1 + line.int_percent / 100);
    const precoBase = unitPrice * line.qt;
    const lineDiscount = line.discount_percent || 0;
    const precoSemIva = precoBase * (1 - lineDiscount / 100);

    const bundleComponents = getLineBundleComponents(line);
    const componentsTotal = bundleComponents.reduce(
      (s: number, c: any) => s + (parseFloat(String(c.unit_price || 0)) * parseFloat(String(c.quantity || 0))),
      0,
    );
    const hasMixedVat = bundleComponents.length > 0 && componentsTotal > 0;

    // Apply global discount to base BEFORE computing VAT (matches PDF + main quote logic).
    const globalFactor = 1 - (iq.desconto_global_percent || 0) / 100;
    const precoSemIvaDescontado = precoSemIva * globalFactor;

    if (hasMixedVat) {
      bundleComponents.forEach((c: any) => {
        const cUnit = parseFloat(String(c.unit_price || 0));
        const cQty = parseFloat(String(c.quantity || 0));
        const cRate = parseFloat(String(c.vat_rate ?? 23));
        const share = (cUnit * cQty) / componentsTotal;
        const base = precoSemIvaDescontado * share;
        const vat = base * (cRate / 100);
        if (!vatByRate[cRate]) vatByRate[cRate] = { base: 0, vat: 0 };
        vatByRate[cRate].base += base;
        vatByRate[cRate].vat += vat;
      });
    } else {
      const rate = line.iva_percent;
      const vat = precoSemIvaDescontado * (rate / 100);
      if (!vatByRate[rate]) vatByRate[rate] = { base: 0, vat: 0 };
      vatByRate[rate].base += precoSemIvaDescontado;
      vatByRate[rate].vat += vat;
    }

    totalSemIva += precoSemIva;
  });

  const globalFactor = 1 - (iq.desconto_global_percent || 0) / 100;
  const totalSemIvaComDesconto = totalSemIva * globalFactor;
  const vatBreakdown = Object.entries(vatByRate)
    .map(([rate, data]) => ({ rate: Number(rate), base: data.base, vat: round2(data.vat) }))
    .sort((a, b) => b.rate - a.rate);
  const totalIva = vatBreakdown.reduce((s, v) => s + v.vat, 0);
  const totalComIva = round2(totalSemIvaComDesconto) + totalIva;

  return {
    totalSemIva,
    totalSemIvaComDesconto,
    totalIva,
    totalComIva,
    totalComDesconto: totalComIva,
    vatBreakdown,
  };
}
