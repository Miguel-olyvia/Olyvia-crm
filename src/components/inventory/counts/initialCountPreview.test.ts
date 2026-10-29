// 29/10/2026: a pré-visualização da contagem inicial conta só os produtos marcados no armazém (migration 20270101240000).
import { describe, expect, it } from "vitest";
import { CATALOGO_CUSTOS_PATH, countInitialLines } from "./initialCountPreview";

function cliente(resposta: { count: number | null; error: unknown }) {
  const chamadas: [string, unknown[]][] = [];
  const q: Record<string, unknown> = {};
  for (const k of ["select", "eq", "is", "neq", "or"]) q[k] = (...a: unknown[]) => { chamadas.push([k, a]); return q; };
  q.then = (ok: (r: unknown) => unknown) => Promise.resolve(resposta).then(ok);
  return { chamadas, c: { from: (t: string) => { chamadas.push(["from", [t]]); return q; } } };
}

describe("countInitialLines", () => {
  it("parte de stocks do armazém (não do catálogo inteiro), com os filtros da base", async () => {
    const { chamadas, c } = cliente({ count: 7, error: null });
    expect(await countInitialLines(c, "org-1", "wh-1", null)).toBe(7);
    expect(chamadas).toEqual([
      ["from", ["stocks"]],
      ["select", ["id, products!inner(id, product_organizations!inner(organization_id))", { count: "exact", head: true }]],
      ["eq", ["warehouse_id", "wh-1"]],
      ["eq", ["organization_id", "org-1"]],
      ["is", ["deleted_at", null]],
      ["eq", ["products.is_deleted", false]],
      ["is", ["products.deleted_at", null]],
      ["neq", ["products.status", "draft"]],
      ["eq", ["products.product_organizations.organization_id", "org-1"]],
    ]);
  });
  it("a categoria (com as descendentes) filtra em category_id OU subcategory_id do produto", async () => {
    const { chamadas, c } = cliente({ count: 2, error: null });
    await countInitialLines(c, "org-1", "wh-1", ["cat-a", "cat-b"]);
    expect(chamadas.at(-1)).toEqual(["or", ["category_id.in.(cat-a,cat-b),subcategory_id.in.(cat-a,cat-b)", { referencedTable: "products" }]]);
  });
  it("erro da consulta propaga-se (o diálogo mostra «não foi possível prever»)", async () => {
    const { c } = cliente({ count: null, error: { message: "boom" } });
    await expect(countInitialLines(c, "org-1", "wh-1", null)).rejects.toEqual({ message: "boom" });
  });
  it("o atalho leva ao Catálogo e custos", () => {
    expect(CATALOGO_CUSTOS_PATH).toBe("/catalogo-custos");
  });
});
