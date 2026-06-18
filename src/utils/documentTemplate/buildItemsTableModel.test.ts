import { describe, it, expect } from "vitest";
import { buildItemsTableModel } from "./buildItemsTableModel";

const line = (description: string, line_total: number, extra: Partial<{ quantity: number; unit_price: number; quote_ref: string | null }> = {}) => ({
  description,
  quantity: extra.quantity ?? 1,
  unit_price: extra.unit_price ?? line_total,
  line_total,
  quote_ref: extra.quote_ref ?? null,
});

describe("buildItemsTableModel", () => {
  it("n=1 → modelo single, ignora `mode` e preserva subtotal", () => {
    const model = buildItemsTableModel({
      quotes: [{ quoteNumber: "OR-1", lines: [line("A", 100), line("B", 50)], subtotal: 150 }],
      settings: { mode: "consolidated" }, // deve ser ignorado
    });
    expect(model.kind).toBe("single");
    if (model.kind !== "single") throw new Error();
    expect(model.lines).toHaveLength(2);
    expect(model.subtotal).toBe(150);
  });

  it("n≥2 + grouped_by_quote → blocos com subtotal por orçamento + total geral", () => {
    const model = buildItemsTableModel({
      quotes: [
        { quoteNumber: "OR-1", lines: [line("A", 100)], subtotal: 100 },
        { quoteNumber: "OR-2", lines: [line("B", 250)], subtotal: 250 },
      ],
      settings: { mode: "grouped_by_quote" },
    });
    expect(model.kind).toBe("grouped_by_quote");
    if (model.kind !== "grouped_by_quote") throw new Error();
    expect(model.groups).toHaveLength(2);
    expect(model.grand_total).toBe(350);
  });

  it("n≥2 + consolidated → linhas únicas com quote_ref preenchido", () => {
    const model = buildItemsTableModel({
      quotes: [
        { quoteNumber: "OR-1", lines: [line("A", 100)], subtotal: 100 },
        { quoteNumber: "OR-2", lines: [line("B", 250)], subtotal: 250 },
      ],
      settings: { mode: "consolidated", show_quote_ref_column: true },
    });
    expect(model.kind).toBe("consolidated");
    if (model.kind !== "consolidated") throw new Error();
    expect(model.lines).toHaveLength(2);
    expect(model.lines[0].quote_ref).toBe("OR-1");
    expect(model.lines[1].quote_ref).toBe("OR-2");
    expect(model.show_quote_ref).toBe(true);
    expect(model.grand_total).toBe(350);
  });

  it("respeita grand_total fornecido (não recalcula)", () => {
    const model = buildItemsTableModel({
      quotes: [
        { quoteNumber: "OR-1", lines: [line("A", 100)], subtotal: 100 },
        { quoteNumber: "OR-2", lines: [line("B", 250)], subtotal: 250 },
      ],
      grand_total: 999, // valor pré-calculado a montante
      settings: { mode: "grouped_by_quote" },
    });
    if (model.kind !== "grouped_by_quote") throw new Error();
    expect(model.grand_total).toBe(999);
  });
});
