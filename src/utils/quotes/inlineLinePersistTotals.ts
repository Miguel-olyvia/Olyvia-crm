import { computeLineVatAmount } from "@/utils/quotes/computeQuoteTotals";
import { getLineSubtotal, round2, type PricedQuoteLine } from "@/utils/quotes/quoteLinePricing";

export interface InlineLinePersistTotals {
  total_sem_iva: number;
  total_com_iva: number;
  total_com_desconto: number;
}

/**
 * Totais gravados numa linha de orçamento inline ao criar a proposta.
 *
 * - total_sem_iva: round2(unitário) × qt, com o desconto da linha (num bundle
 *   o unitário é a soma dos componentes arredondados — getLineUnitPrice).
 * - IVA: computeLineVatAmount — num bundle reparte-se pelos componentes
 *   (mão de obra a 6%, material a 23%) e o iva_override manda. Antes usava o
 *   iva_percent da linha (23 nos bundles) para o valor inteiro, inflacionando
 *   a linha e o total do orçamento (a RPC soma total_com_desconto).
 * - Tudo fechado ao cêntimo.
 */
export function computeInlineLinePersistTotals(
  line: PricedQuoteLine & { iva_percent?: number | string | null; selected_attributes?: unknown },
  descontoGlobalPercent: number | null | undefined,
): InlineLinePersistTotals {
  const totalSemIva = getLineSubtotal(line);
  const ivaValor = round2(computeLineVatAmount(line, totalSemIva));
  const totalComIva = round2(totalSemIva + ivaValor);
  const totalComDesconto = round2(totalComIva * (1 - (descontoGlobalPercent || 0) / 100));
  return {
    total_sem_iva: totalSemIva,
    total_com_iva: totalComIva,
    total_com_desconto: totalComDesconto,
  };
}
