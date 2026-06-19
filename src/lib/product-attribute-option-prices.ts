/**
 * Resolve effective option prices for a product attribute.
 *
 * Hierarchy (most specific wins, first hit stops the search):
 *   1. Product
 *   2. Subcategory  (the product's `subcategory_id`)
 *   3. Category     (the product's `category_id`)
 *   4. Global
 *
 * NOTE: This system has only TWO levels of categorisation
 * (Categoria → Subcategoria). There is no concept of "ancestor"
 * categories above the product's category. The `source` union still
 * includes `"ancestor_category"` for backwards compatibility with
 * existing imports, but it is never emitted.
 */
import { supabase } from "@/integrations/supabase/client";
import type { PriceContextCode } from "@/hooks/usePriceContexts";

export interface EffectiveOptionPrice {
  attrId: string;
  value: string;
  price: number;
  productId: string | null;
  categoryId: string | null;
  source: "product" | "subcategory" | "category" | "ancestor_category" | "global";
}

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

function sourceRank(source: EffectiveOptionPrice["source"]): number {
  switch (source) {
    case "product": return 0;
    case "subcategory": return 1;
    case "category": return 2;
    case "global": return 3;
    default: return 999;
  }
}

export async function getEffectiveProductOptionPrices(params: {
  productId: string;
  attributeIds: string[];
  priceContext?: PriceContextCode;
}): Promise<EffectiveOptionPrice[]> {
  const { productId, attributeIds, priceContext } = params;
  if (!productId || attributeIds.length === 0) return [];

  const [contextId, refs] = await Promise.all([
    getPriceContextId(priceContext ?? null),
    getProductCategoryRefs(productId),
  ]);

  const categoryIds: string[] = [];
  if (refs.subcategoryId) categoryIds.push(refs.subcategoryId);
  if (refs.categoryId && refs.categoryId !== refs.subcategoryId) categoryIds.push(refs.categoryId);

  const productRowsPromise = supabase
    .from("product_attribute_value_prices")
    .select("attribute_id, value_option, price, product_id, category_id, price_context_id")
    .in("attribute_id", attributeIds)
    .eq("product_id", productId);

  const scopedRowsPromise = categoryIds.length
    ? supabase
        .from("product_attribute_value_prices")
        .select("attribute_id, value_option, price, product_id, category_id, price_context_id")
        .in("attribute_id", attributeIds)
        .is("product_id", null)
        .or(`category_id.in.(${categoryIds.join(",")}),category_id.is.null`)
    : supabase
        .from("product_attribute_value_prices")
        .select("attribute_id, value_option, price, product_id, category_id, price_context_id")
        .in("attribute_id", attributeIds)
        .is("product_id", null)
        .is("category_id", null);

  const [{ data: productRows }, { data: scopedRows }] = await Promise.all([
    productRowsPromise,
    scopedRowsPromise,
  ]);

  const best = new Map<string, { price: EffectiveOptionPrice; contextRank: number; sourceRank: number }>();

  for (const row of [...(productRows || []), ...(scopedRows || [])] as any[]) {
    const rowContextId = row.price_context_id ?? null;
    if (contextId) {
      // Accept context match or no-context fallback only.
      if (rowContextId !== contextId && rowContextId !== null) continue;
    } else if (rowContextId !== null) {
      continue;
    }
    const contextRank = rowContextId === contextId && contextId ? 0 : 1;

    let source: EffectiveOptionPrice["source"];
    if (row.product_id) {
      source = "product";
    } else if (row.category_id) {
      if (row.category_id === refs.subcategoryId) source = "subcategory";
      else if (row.category_id === refs.categoryId) source = "category";
      else continue; // category not in {subcategory, category} of this product → ignore
    } else {
      source = "global";
    }

    const sRank = sourceRank(source);
    const key = `${row.attribute_id}|${row.value_option}`;
    const candidate: EffectiveOptionPrice = {
      attrId: row.attribute_id,
      value: row.value_option,
      price: Number(row.price) || 0,
      productId: row.product_id ?? null,
      categoryId: row.category_id ?? null,
      source,
    };

    const current = best.get(key);
    if (
      !current ||
      contextRank < current.contextRank ||
      (contextRank === current.contextRank && sRank < current.sourceRank)
    ) {
      best.set(key, { price: candidate, contextRank, sourceRank: sRank });
    }
  }

  return Array.from(best.values()).map((entry) => entry.price);
}
