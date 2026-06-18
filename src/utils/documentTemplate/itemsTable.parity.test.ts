/**
 * Paridade frontend ↔ edge para buildItemsTableModel.
 *
 * Lê a versão frontend (src/utils/documentTemplate/buildItemsTableModel.ts)
 * e compara o output com a cópia Deno deste pacote, garantindo que ambas
 * permanecem alinhadas.
 *
 * CI: bunx vitest run supabase/functions/_shared/itemsTable.parity.test.ts
 */

import { describe, it, expect } from "vitest";
import { buildItemsTableModel as edgeBuild } from "@/../supabase/functions/_shared/itemsTable.ts";
import { buildItemsTableModel as feBuild } from "./buildItemsTableModel";

const FIXTURES = [
  {
    name: "n=1 single",
    input: {
      quotes: [{ quoteNumber: "OR-1", lines: [{ description: "A", quantity: 1, unit_price: 100, line_total: 100 }], subtotal: 100 }],
    },
  },
  {
    name: "n=2 grouped_by_quote (default)",
    input: {
      quotes: [
        { quoteNumber: "OR-1", lines: [{ description: "A", quantity: 1, unit_price: 100, line_total: 100 }], subtotal: 100 },
        { quoteNumber: "OR-2", lines: [{ description: "B", quantity: 2, unit_price: 125, line_total: 250 }], subtotal: 250 },
      ],
      settings: { mode: "grouped_by_quote" as const },
    },
  },
  {
    name: "n=2 consolidated",
    input: {
      quotes: [
        { quoteNumber: "OR-1", lines: [{ description: "A", quantity: 1, unit_price: 100, line_total: 100 }], subtotal: 100 },
        { quoteNumber: "OR-2", lines: [{ description: "B", quantity: 2, unit_price: 125, line_total: 250 }], subtotal: 250 },
      ],
      settings: { mode: "consolidated" as const, show_quote_ref_column: true },
    },
  },
  {
    name: "n=2 com grand_total explícito",
    input: {
      quotes: [
        { quoteNumber: "OR-1", lines: [{ description: "A", quantity: 1, unit_price: 100, line_total: 100 }], subtotal: 100 },
        { quoteNumber: "OR-2", lines: [{ description: "B", quantity: 1, unit_price: 250, line_total: 250 }], subtotal: 250 },
      ],
      grand_total: 999,
      settings: { mode: "grouped_by_quote" as const },
    },
  },
];

describe("itemsTable parity (frontend ↔ edge)", () => {
  for (const f of FIXTURES) {
    it(f.name, () => {
      expect(edgeBuild(f.input as any)).toEqual(feBuild(f.input as any));
    });
  }
});
