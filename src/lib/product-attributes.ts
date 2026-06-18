/**
 * Centralized helper to discover the effective set of attributes that apply to a product,
 * walking the category hierarchy and combining direct product attributes, category attributes
 * and category-level palettes.
 *
 * Goals:
 *  - Single source of truth for attribute discovery used by line/quote/bundle/product UIs.
 *  - Never silently drop an inherited attribute (fail-safe for RPC failures).
 *  - Only call resolve_product_attribute_options for attributes that actually need options.
 *
 * Out of scope: migrations, RLS, schema changes, new pricing logic.
 */
import { supabase } from "@/integrations/supabase/client";
import type { PriceContextCode } from "@/hooks/usePriceContexts";

export type AttributeSource =
  | "product"
  | "subcategory"
  | "category"
  | "ancestor_category";

export interface ResolvedAttributeOption {
  value_text: string;
  display_name: string;
  hex_color: string | null;
  price_addon: number;
  is_available: boolean;
  /** RPC source — origin of the OPTION (palette/value), NOT of the product↔attribute link. */
  source: string;
}

export interface EffectiveAttributeDirectValue {
  value_text?: string | null;
  value_number?: number | null;
  value_bool?: boolean | null;
  value_date?: string | null;
  value_json?: any;
  unit?: string | null;
}

export interface EffectiveAttribute {
  // Raw fields from product_attributes (real schema)
  id: string;
  code: string;
  label: string;
  value_type: string;
  unit: string | null;
  allowed_values: any | null;
  options: any | null;
  has_hex_color: boolean | null;
  is_measurement: boolean | null;
  measurement_type: string | null;
  is_variant_option: boolean | null;
  sort_order: number | null;
  pricing_type: string | null;
  pricing_unit: string | null;
  price_per_unit: number | null;
  valorization_type: string | null;
  pricing_dimension: string | null;

  // Helper-computed metadata
  /** Where the product↔attribute association comes from. */
  source: AttributeSource;
  /** Category id that introduced this attribute, when source is category-related. */
  sourceCategoryId: string | null;

  /** Resolved options (only populated for attributes that need them). */
  resolvedOptions?: ResolvedAttributeOption[];
  /** Direct value stored on product_attribute_values, when present. */
  directValue?: EffectiveAttributeDirectValue;
}

export interface GetEffectiveAttributesParams {
  productId: string;
  /** Reserved for future filtering / telemetry — not used for pricing today. */
  organizationId?: string;
  /** Reserved for compatibility — RPC signature does not accept context today. */
  priceContext?: PriceContextCode;
  /** Default true. When false, skips reading product_attribute_values direct values. */
  includeDirectValues?: boolean;
}

const MAX_HIERARCHY_DEPTH = 10;

/**
 * Decide if an attribute needs options resolved via RPC.
 * Conservative: any signal of a list/palette/fixed-priced attribute triggers resolution.
 */
function attributeNeedsResolvedOptions(attr: {
  value_type?: string | null;
  allowed_values?: any;
  options?: any;
  has_hex_color?: boolean | null;
  pricing_type?: string | null;
}): boolean {
  const vt = (attr.value_type || "").toString().toLowerCase().trim();
  const listLikeTypes = new Set([
    "list",
    "enum",
    "select",
    "multiselect",
    "multi_select",
    "color",
    "palette",
  ]);
  if (listLikeTypes.has(vt)) return true;

  if (Array.isArray(attr.allowed_values) && attr.allowed_values.length > 0) return true;
  if (Array.isArray(attr.options) && attr.options.length > 0) return true;

  if (attr.has_hex_color === true) return true;

  const pt = (attr.pricing_type || "").toString().toLowerCase().trim();
  if (pt === "fixed" || pt === "both") return true;

  return false;
}

interface CategoryChainNode {
  id: string;
  level: number; // 0 = product.subcategory, 1 = product.category, 2+ = ancestors
  origin: AttributeSource;
}

async function resolveCategoryChain(
  subcategoryId: string | null,
  categoryId: string | null
): Promise<CategoryChainNode[]> {
  const chain: CategoryChainNode[] = [];
  const seen = new Set<string>();

  const pushIfNew = (id: string | null, origin: AttributeSource, level: number) => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    chain.push({ id, level, origin });
  };

  pushIfNew(subcategoryId, "subcategory", 0);
  pushIfNew(categoryId, "category", chain.length);

  // Walk parents starting from the deepest known node.
  let cursor = subcategoryId || categoryId;
  let safety = 0;
  while (cursor && safety < MAX_HIERARCHY_DEPTH) {
    safety++;
    const { data, error } = await supabase
      .from("product_categories")
      .select("parent_category_id")
      .eq("id", cursor)
      .maybeSingle();

    if (error) {
      console.warn("[product-attributes] failed to fetch category parent", cursor, error);
      break;
    }
    const parentId = data?.parent_category_id || null;
    if (!parentId || seen.has(parentId)) break;
    pushIfNew(parentId, "ancestor_category", chain.length);
    cursor = parentId;
  }

  return chain;
}

export async function getEffectiveProductAttributes(
  params: GetEffectiveAttributesParams
): Promise<EffectiveAttribute[]> {
  const { productId, includeDirectValues = true } = params;

  if (!productId) return [];

  // 1) Product context
  const { data: product, error: productErr } = await supabase
    .from("products")
    .select("id, category_id, subcategory_id")
    .eq("id", productId)
    .maybeSingle();

  if (productErr || !product) {
    console.warn("[product-attributes] product not found", productId, productErr);
    return [];
  }

  // 2) Category chain
  const chain = await resolveCategoryChain(
    (product as any).subcategory_id || null,
    (product as any).category_id || null
  );
  const chainIds = chain.map((c) => c.id);

  // 3) Parallel fetch: direct values, category_attributes, palettes
  const directPromise = includeDirectValues
    ? supabase
        .from("product_attribute_values")
        .select(
          "attribute_id, value_text, value_number, value_bool, value_date, value_json, unit"
        )
        .eq("product_id", productId)
    : Promise.resolve({ data: [] as any[], error: null });

  const catAttrsPromise = chainIds.length
    ? supabase
        .from("category_attributes")
        .select("category_id, attribute_id, sort_order")
        .in("category_id", chainIds)
    : Promise.resolve({ data: [] as any[], error: null });

  const palettesPromise = chainIds.length
    ? supabase
        .from("category_attribute_palettes")
        .select("category_id, attribute_id")
        .in("category_id", chainIds)
    : Promise.resolve({ data: [] as any[], error: null });

  const [directRes, catAttrsRes, palettesRes] = await Promise.all([
    directPromise,
    catAttrsPromise,
    palettesPromise,
  ]);

  if (directRes.error) console.warn("[product-attributes] direct values error", directRes.error);
  if (catAttrsRes.error) console.warn("[product-attributes] category_attributes error", catAttrsRes.error);
  if (palettesRes.error) console.warn("[product-attributes] palettes error", palettesRes.error);

  const directRows = (directRes.data || []) as any[];
  const catAttrRows = (catAttrsRes.data || []) as any[];
  const paletteRows = (palettesRes.data || []) as any[];

  // 4) Build attributeId -> source map (priority: product > subcategory > category > ancestor)
  type AssignmentMeta = { source: AttributeSource; sourceCategoryId: string | null; sortHint: number };
  const assignments = new Map<string, AssignmentMeta>();

  const sourcePriority: Record<AttributeSource, number> = {
    product: 0,
    subcategory: 1,
    category: 2,
    ancestor_category: 3,
  };

  const upsertAssignment = (
    attributeId: string,
    candidate: AssignmentMeta
  ) => {
    const existing = assignments.get(attributeId);
    if (!existing || sourcePriority[candidate.source] < sourcePriority[existing.source]) {
      assignments.set(attributeId, candidate);
    }
  };

  // Direct (product) assignments
  for (const row of directRows) {
    upsertAssignment(row.attribute_id, {
      source: "product",
      sourceCategoryId: null,
      sortHint: 0,
    });
  }

  // Category-derived assignments — walk chain in order so the closest wins.
  const chainOrderById = new Map<string, CategoryChainNode>();
  for (const node of chain) chainOrderById.set(node.id, node);

  for (const row of catAttrRows) {
    const node = chainOrderById.get(row.category_id);
    if (!node) continue;
    upsertAssignment(row.attribute_id, {
      source: node.origin,
      sourceCategoryId: row.category_id,
      sortHint: row.sort_order ?? 0,
    });
  }
  for (const row of paletteRows) {
    const node = chainOrderById.get(row.category_id);
    if (!node) continue;
    upsertAssignment(row.attribute_id, {
      source: node.origin,
      sourceCategoryId: row.category_id,
      sortHint: 0,
    });
  }

  if (assignments.size === 0) return [];

  // 5) Load attribute definitions
  const attrIds = Array.from(assignments.keys());
  const { data: attrRows, error: attrErr } = await supabase
    .from("product_attributes")
    .select(
      "id, code, label, value_type, unit, allowed_values, options, has_hex_color, is_measurement, measurement_type, is_variant_option, sort_order, pricing_type, pricing_unit, price_per_unit, valorization_type, pricing_dimension"
    )
    .in("id", attrIds);

  if (attrErr) {
    console.warn("[product-attributes] failed to load attribute definitions", attrErr);
    return [];
  }

  const directByAttr = new Map<string, any>();
  for (const row of directRows) directByAttr.set(row.attribute_id, row);

  // 6) Build effective list
  const effective: EffectiveAttribute[] = (attrRows || []).map((a: any) => {
    const meta = assignments.get(a.id)!;
    const direct = directByAttr.get(a.id);

    const eff: EffectiveAttribute = {
      id: a.id,
      code: a.code,
      label: a.label,
      value_type: a.value_type,
      unit: a.unit ?? null,
      allowed_values: a.allowed_values ?? null,
      options: a.options ?? null,
      has_hex_color: a.has_hex_color ?? null,
      is_measurement: a.is_measurement ?? null,
      measurement_type: a.measurement_type ?? null,
      is_variant_option: a.is_variant_option ?? null,
      sort_order: a.sort_order ?? null,
      pricing_type: a.pricing_type ?? null,
      pricing_unit: a.pricing_unit ?? null,
      price_per_unit: a.price_per_unit ?? null,
      valorization_type: a.valorization_type ?? null,
      pricing_dimension: a.pricing_dimension ?? null,
      source: meta.source,
      sourceCategoryId: meta.sourceCategoryId,
    };

    if (direct) {
      eff.directValue = {
        value_text: direct.value_text ?? null,
        value_number: direct.value_number ?? null,
        value_bool: direct.value_bool ?? null,
        value_date: direct.value_date ?? null,
        value_json: direct.value_json ?? null,
        unit: direct.unit ?? null,
      };
    }

    return eff;
  });

  // 7) Resolve options ONLY for attributes that need them — fail-safe per attribute.
  const needingOptions = effective.filter(attributeNeedsResolvedOptions);

  if (needingOptions.length > 0) {
    const settled = await Promise.allSettled(
      needingOptions.map(async (attr) => {
        const { data, error } = await supabase.rpc(
          "resolve_product_attribute_options",
          { p_product_id: productId, p_attribute_id: attr.id }
        );
        if (error) throw error;
        return { attrId: attr.id, rows: data || [] };
      })
    );

    settled.forEach((res, idx) => {
      const attr = needingOptions[idx];
      if (res.status === "fulfilled") {
        const rows = res.value.rows as any[];
        attr.resolvedOptions = rows.map((r) => ({
          value_text: r.value_text,
          display_name: r.display_name || r.value_text,
          hex_color: r.hex_color || null,
          price_addon: Number(r.price_addon) || 0,
          is_available: r.is_available !== false,
          source: r.source || "",
        }));
      } else {
        // FAIL-SAFE: never drop the attribute. Fallback to allowed_values/options.
        console.warn(
          "[product-attributes] resolve_product_attribute_options failed for attribute",
          attr.id,
          res.reason
        );
        const fallbackList: ResolvedAttributeOption[] = [];
        const src = Array.isArray(attr.allowed_values)
          ? attr.allowed_values
          : Array.isArray(attr.options)
          ? attr.options
          : [];
        for (const v of src) {
          if (typeof v === "string") {
            fallbackList.push({
              value_text: v,
              display_name: v,
              hex_color: null,
              price_addon: 0,
              is_available: true,
              source: "fallback_definition",
            });
          } else if (v && typeof v === "object") {
            const value_text = v.value || v.value_text || v.code || "";
            if (!value_text) continue;
            fallbackList.push({
              value_text,
              display_name: v.display_name || v.label || value_text,
              hex_color: v.hex_color || null,
              price_addon: Number(v.price_addon) || 0,
              is_available: true,
              source: "fallback_definition",
            });
          }
        }
        attr.resolvedOptions = fallbackList;
      }
    });
  }

  // 8) Sort: by attribute sort_order, then label
  effective.sort((a, b) => {
    const sa = a.sort_order ?? 9999;
    const sb = b.sort_order ?? 9999;
    if (sa !== sb) return sa - sb;
    return (a.label || "").localeCompare(b.label || "");
  });

  return effective;
}

export { attributeNeedsResolvedOptions };
