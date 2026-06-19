/**
 * buildItemsTableModel — modelo formatado da tabela de artigos.
 *
 * REGRAS CRÍTICAS (.lovable/plan.md §8):
 * - NUNCA recalcula totais, IVA, descontos, fees, quantidades ou margens.
 *   Consome valores já calculados a montante (snapshots, edge functions,
 *   resolvers de pricing).
 * - n=1 → comportamento idêntico ao render atual (linhas simples).
 * - n≥2 + grouped_by_quote → blocos por orçamento com subtotal por bloco.
 * - n≥2 + consolidated → linhas únicas com `quote_ref` opcional.
 *
 * TS puro, sem deps browser/Node — Deno-compatible by construction.
 * Cópia espelhada planeada em supabase/functions/_shared/itemsTable.ts.
 */

import type { ItemsTableSettings } from "./types";

export interface ItemsTableLine {
  description: string;
  quantity: number;
  unit?: string | null;
  unit_price: number;
  /** Subtotal já calculado a montante. */
  line_total: number;
  /** Referência do orçamento de origem (apenas usado em multi-orçamento). */
  quote_ref?: string | null;
  /** Origem do item (produto/serviço/bundle/manual) — apenas para filtros visuais. */
  kind?: "product" | "service" | "bundle" | "manual";
  /** Componentes do bundle (apenas quando kind === "bundle"). Render-only. */
  components?: { descricao: string; qtd: number; unidade?: string }[];
}

export interface ItemsTableQuote {
  /** Identificador externo (ex.: "OR-2026-00012"). */
  quoteNumber: string;
  lines: ItemsTableLine[];
  /** Subtotal do orçamento já calculado a montante. */
  subtotal: number;
}

export interface ItemsTableInput {
  quotes: ItemsTableQuote[];
  settings?: ItemsTableSettings;
  /** Total geral pré-calculado (n≥2). Quando ausente, soma os subtotals fornecidos sem aplicar regras de IVA/desconto. */
  grand_total?: number;
}

export type ItemsTableModelKind = "single" | "grouped_by_quote" | "consolidated";

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

  // n=1 → exatamente o comportamento atual; ignora `mode`.
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

  // Default multi-quote: grouped_by_quote (também aplica para mode === "single" defensivamente).
  return {
    kind: "grouped_by_quote",
    groups: quotes,
    grand_total: input.grand_total ?? sumSubtotals(quotes),
  };
}
