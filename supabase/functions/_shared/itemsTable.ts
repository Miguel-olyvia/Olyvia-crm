/**
 * buildItemsTableModel — cópia espelhada (Deno) de
 * src/utils/documentTemplate/buildItemsTableModel.ts
 *
 * Manter EXATAMENTE em paridade com a versão frontend. Qualquer alteração
 * deve ser feita nos dois ficheiros ao mesmo tempo. CI / testes de paridade
 * validam que os outputs são idênticos nos 3 modos (single, grouped, consolidated).
 *
 * REGRAS (.lovable/plan.md §8):
 * - NUNCA recalcula totais, IVA, descontos, fees, quantidades ou margens.
 * - Consome valores já calculados a montante.
 */

export type ItemsTableMode = "single" | "grouped_by_quote" | "consolidated";

export interface ItemsTableSettings {
  mode?: ItemsTableMode;
  show_quote_ref_column?: boolean;
  show_subtotals?: boolean;
  zebra_rows?: boolean;
  compact?: boolean;
}

export interface ItemsTableLine {
  description: string;
  quantity: number;
  unit?: string | null;
  unit_price: number;
  line_total: number;
  quote_ref?: string | null;
}

export interface ItemsTableQuote {
  quoteNumber: string;
  lines: ItemsTableLine[];
  subtotal: number;
}

export interface ItemsTableInput {
  quotes: ItemsTableQuote[];
  settings?: ItemsTableSettings;
  grand_total?: number;
}

export interface ItemsTableModelSingle {
  kind: "single";
  lines: ItemsTableLine[];
  subtotal: number;
}

export interface ItemsTableModelGrouped {
  kind: "grouped_by_quote";
  groups: ItemsTableQuote[];
  grand_total: number;
}

export interface ItemsTableModelConsolidated {
  kind: "consolidated";
  lines: ItemsTableLine[];
  grand_total: number;
  show_quote_ref: boolean;
}

export type ItemsTableModel =
  | ItemsTableModelSingle
  | ItemsTableModelGrouped
  | ItemsTableModelConsolidated;

function sumSubtotals(quotes: ItemsTableQuote[]): number {
  return quotes.reduce((acc, q) => acc + (q.subtotal ?? 0), 0);
}

export function buildItemsTableModel(input: ItemsTableInput): ItemsTableModel {
  const quotes = input.quotes ?? [];

  if (quotes.length <= 1) {
    const single = quotes[0];
    return {
      kind: "single",
      lines: single?.lines ?? [],
      subtotal: single?.subtotal ?? 0,
    };
  }

  const mode = input.settings?.mode ?? "grouped_by_quote";

  if (mode === "consolidated") {
    const lines: ItemsTableLine[] = [];
    for (const q of quotes) {
      for (const line of q.lines) {
        lines.push({
          ...line,
          quote_ref: line.quote_ref ?? q.quoteNumber,
        });
      }
    }
    return {
      kind: "consolidated",
      lines,
      grand_total: input.grand_total ?? sumSubtotals(quotes),
      show_quote_ref: input.settings?.show_quote_ref_column ?? true,
    };
  }

  return {
    kind: "grouped_by_quote",
    groups: quotes,
    grand_total: input.grand_total ?? sumSubtotals(quotes),
  };
}
