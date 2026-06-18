/**
 * Single source of truth for resolving product attribute price RANGES.
 *
 * Hierarchy (most specific wins, first hit stops the search):
 *   1. Product
 *   2. Subcategory  (the product's `subcategory_id`)
 *   3. Category     (the product's `category_id`)
 *   4. Global
 *
 * NOTE: This system has only TWO levels of categorisation
 * (Categoria → Subcategoria). There is no concept of "ancestor"
 * categories above the product's category. The `source` union keeps
 * `"ancestor_category"` for backwards compatibility with imports, but
 * it is never emitted.
 *
 * Used by all READ UIs (line attributes dialog, product configurable
 * options dialog, add-items dialog, quote builders) so the same product
 * always shows the same ranges everywhere.
 *
 * NOT used by editor UIs (RangeScalesTab, ProductAttributePricesDialog,
 * AttributeContextPricesTab) — those intentionally read raw rows scoped
 * to what the user is editing.
 */
import { supabase } from "@/integrations/supabase/client";
import type { PriceContextCode } from "@/hooks/usePriceContexts";

export interface EffectiveRangeRow {
  id: string;
  attribute_id: string;
  product_id: string | null;
  category_id: string | null;
  price_context_id: string | null;
  range_type: string;
  min_value: number | null;
  max_value: number | null;
  min_width: number | null;
  max_width: number | null;
  min_height: number | null;
  max_height: number | null;
  min_depth: number | null;
  max_depth: number | null;
  price_per_unit: number;
  cost_impact: number | null;
  source: "product" | "subcategory" | "category" | "ancestor_category" | "global";
}

const RANGE_SELECT =
  "id, attribute_id, product_id, category_id, price_context_id, range_type, min_value, max_value, min_width, max_width, min_height, max_height, min_depth, max_depth, price_per_unit, cost_impact";

async function getPriceContextId(priceContext?: PriceContextCode | null): Promise<string | null> {
  if (!priceContext) return null;
  const { data } = await supabase
    .from("price_contexts")
    .select("id")
    .eq("code", priceContext)
    .order("organization_id", { ascending: false, nullsFirst: false })
    .limit(1);
  return data?.[0]?.id ?? null;
}

interface CategoryRefs {
  subcategoryId: string | null;
  categoryId: string | null;
}

async function getProductCategoryRefs(productId: string): Promise<CategoryRefs> {
  const { data } = await supabase
    .from("products")
    .select("category_id, subcategory_id")
    .eq("id", productId)
    .maybeSingle();
  if (!data) return { subcategoryId: null, categoryId: null };
  return {
    subcategoryId: ((data as any).subcategory_id ?? null) as string | null,
    categoryId: ((data as any).category_id ?? null) as string | null,
  };
}

function sourceRank(source: EffectiveRangeRow["source"]): number {
  switch (source) {
    case "product": return 0;
    case "subcategory": return 1;
    case "category": return 2;
    case "global": return 3;
    default: return 999;
  }
}

/**
 * Returns ranges grouped by attribute_id for a given product, applying the
 * canonical hierarchy. The first scope that yields any range for an attribute
 * wins for that attribute (we never mix ranges from multiple scopes).
 */
export async function getEffectiveProductRanges(params: {
  productId: string;
  attributeIds: string[];
  priceContext?: PriceContextCode | null;
}): Promise<Map<string, EffectiveRangeRow[]>> {
  const { productId, attributeIds, priceContext } = params;
  const out = new Map<string, EffectiveRangeRow[]>();
  if (!productId || attributeIds.length === 0) return out;

  const [contextId, refs] = await Promise.all([
    getPriceContextId(priceContext ?? null),
    getProductCategoryRefs(productId),
  ]);

  const categoryIds: string[] = [];
  if (refs.subcategoryId) categoryIds.push(refs.subcategoryId);
  if (refs.categoryId && refs.categoryId !== refs.subcategoryId) categoryIds.push(refs.categoryId);

  // Single broad query: product-specific OR (no product AND category in {subcat, cat})
  // OR (no product AND no category — global). Filtering by context happens client-side
  // so we can fall back to no-context rows.
  const orParts = [`product_id.eq.${productId}`];
  if (categoryIds.length > 0) {
    orParts.push(`and(product_id.is.null,category_id.in.(${categoryIds.join(",")}))`);
  }
  orParts.push("and(product_id.is.null,category_id.is.null)");

  const { data: rows, error } = await (supabase as any)
    .from("product_attribute_price_ranges")
    .select(RANGE_SELECT)
    .in("attribute_id", attributeIds)
    .or(orParts.join(","));

  if (error) {
    console.warn("[product-attribute-ranges] fetch error", error);
    return out;
  }

  const byAttr = new Map<string, any[]>();
  for (const r of rows || []) {
    const list = byAttr.get(r.attribute_id) || [];
    list.push(r);
    byAttr.set(r.attribute_id, list);
  }

  for (const attrId of attributeIds) {
    const all = byAttr.get(attrId) || [];
    if (all.length === 0) {
      out.set(attrId, []);
      continue;
    }

    const annotated = all
      .map((r: any) => {
        let source: EffectiveRangeRow["source"];
        if (r.product_id) {
          source = "product";
        } else if (r.category_id) {
          if (r.category_id === refs.subcategoryId) source = "subcategory";
          else if (r.category_id === refs.categoryId) source = "category";
          else return null; // category not in {subcategory, category} → ignore
        } else {
          source = "global";
        }

        const rowContextId = r.price_context_id ?? null;
        if (contextId) {
          if (rowContextId !== contextId && rowContextId !== null) return null;
        } else if (rowContextId !== null) {
          return null;
        }
        const contextRank = rowContextId === contextId && contextId ? 0 : 1;

        return {
          row: { ...r, source } as EffectiveRangeRow,
          sRank: sourceRank(source),
          cRank: contextRank,
        };
      })
      .filter(Boolean) as Array<{ row: EffectiveRangeRow; sRank: number; cRank: number }>;

    if (annotated.length === 0) {
      out.set(attrId, []);
      continue;
    }

    // Pick the best (cRank, sRank) bucket and return ALL rows that share it,
    // so every tier defined at the chosen scope is preserved (never mix scopes).
    annotated.sort((a, b) => (a.cRank - b.cRank) || (a.sRank - b.sRank));
    const best = annotated[0];
    const winners = annotated.filter((x) => x.cRank === best.cRank && x.sRank === best.sRank);
    out.set(attrId, winners.map((w) => w.row));
  }

  for (const id of attributeIds) {
    if (!out.has(id)) out.set(id, []);
  }

  return out;
}
