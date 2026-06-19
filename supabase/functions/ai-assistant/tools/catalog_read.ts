// Fase 4.B — Catálogo (leitura).
// 6 tools read-only: get_product_details, search_services, get_service_details,
// search_bundles, get_bundle_details, list_categories, get_product_price, get_product_stock.
// Sem mutations. Sem dependência de catalog_items (legacy).
//
// Permissões: products.view (products + bundles) / services.view.

import { requirePermission } from "../shared/authz.ts";
import type { ExecCtx, Handler, ToolDef, ToolResult } from "../shared/types.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);

function escapeIlike(q: string): string {
  return q.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

// Resolve retail price (mais recente, válido) — paridade com add_quote_items.
async function fetchRetailPrice(
  supabase: any,
  kind: "product" | "service",
  id: string,
): Promise<{ price: number | null; vat_rate: number | null; currency: string | null }> {
  const table = kind === "product" ? "product_prices" : "service_prices";
  const fk = kind === "product" ? "product_id" : "service_id";
  const { data } = await supabase
    .from(table)
    .select("price, vat_rate, currency")
    .eq(fk, id)
    .eq("price_type", "retail")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return { price: null, vat_rate: null, currency: null };
  return {
    price: Number(data.price),
    vat_rate: data.vat_rate != null ? Number(data.vat_rate) : null,
    currency: data.currency ?? "EUR",
  };
}

// ============================================================================
// get_product_details
// ============================================================================
export const getProductDetailsDef: ToolDef = {
  type: "function",
  function: {
    name: "get_product_details",
    description:
      "Detalhes de um produto: header (sku, nome, descrição, categoria, marca), preço retail actual, stock agregado e contagem de atributos. product_id aceita UUID, SKU exacto ou nome (resolvido pelo servidor).",
    parameters: {
      type: "object",
      properties: { product_id: { type: "string" } },
      required: ["product_id"],
    },
  },
};

const getProductDetails: Handler = async (ctx, args): Promise<ToolResult> => {
  const perm = requirePermission(ctx, "products.view", "ver produtos");
  if (perm) return perm;
  if (!isUuid(args?.product_id)) return { success: false, message: "product_id inválido." };

  const { data: p, error } = await ctx.supabase
    .from("products")
    .select(`
      id, sku, name, short_description, long_description, status, is_active,
      product_kind, is_sellable, is_purchasable, has_variants, barcode,
      category:product_categories!products_category_id_fkey(id, name, path),
      brand:brands(id, name)
    `)
    .eq("id", args.product_id)
    .eq("organization_id", ctx.organizationId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return { success: false, message: error.message };
  if (!p) return { success: false, message: "Produto não encontrado nesta organização." };

  const [price, stockAgg, attrCount] = await Promise.all([
    fetchRetailPrice(ctx.supabase, "product", args.product_id),
    ctx.supabase.from("product_stock")
      .select("qty_available, qty_reserved")
      .eq("product_id", args.product_id),
    ctx.supabase.from("product_attributes")
      .select("id", { count: "exact", head: true })
      .eq("product_id", args.product_id),
  ]);

  const rows = (stockAgg.data ?? []) as any[];
  const on_hand = rows.reduce((s, r) => s + Number(r.qty_available || 0) + Number(r.qty_reserved || 0), 0);
  const reserved = rows.reduce((s, r) => s + Number(r.qty_reserved || 0), 0);
  const available = rows.reduce((s, r) => s + Number(r.qty_available || 0), 0);

  return {
    success: true,
    data: {
      ...p,
      price,
      stock: { on_hand, reserved, available, location_count: rows.length },
      attribute_count: attrCount.count ?? 0,
      link: `/products?open=${p.id}`,
    },
  };
};

// ============================================================================
// search_services
// ============================================================================
export const searchServicesDef: ToolDef = {
  type: "function",
  function: {
    name: "search_services",
    description:
      "Procura serviços por nome ou SKU (min 2 chars). Filtros opcionais: category_id, is_active (default true).",
    parameters: {
      type: "object",
      properties: {
        q: { type: "string" },
        category_id: { type: "string" },
        is_active: { type: "boolean", description: "Default true." },
        limit: { type: "number", description: "1-25, default 10." },
      },
      required: ["q"],
    },
  },
};

const searchServices: Handler = async (ctx, args): Promise<ToolResult> => {
  const perm = requirePermission(ctx, "services.view", "ver serviços");
  if (perm) return perm;
  const q = String(args?.q ?? "").trim();
  if (q.length < 2) return { success: false, message: "q precisa de ≥2 caracteres." };
  const limit = Math.max(1, Math.min(25, Number(args?.limit) || 10));
  const onlyActive = args?.is_active !== false;
  const pat = `%${escapeIlike(q)}%`;

  let base = ctx.supabase
    .from("services")
    .select("id, sku, name, short_desc, is_active, service_category_id")
    .eq("organization_id", ctx.organizationId)
    .is("deleted_at", null)
    .eq("is_deleted", false)
    .limit(50);
  if (onlyActive) base = base.eq("is_active", true);
  if (args?.category_id && isUuid(args.category_id)) base = base.eq("service_category_id", args.category_id);

  const [byName, bySku] = await Promise.all([
    base.ilike("name", pat),
    base.ilike("sku", pat),
  ]);

  const byId = new Map<string, any>();
  for (const r of [...(byName.data ?? []), ...(bySku.data ?? [])]) {
    if (r?.id && !byId.has(r.id)) byId.set(r.id, r);
  }
  const items = Array.from(byId.values())
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
    .slice(0, limit);
  return { success: true, data: { items, count: items.length, query: q } };
};

// ============================================================================
// get_service_details
// ============================================================================
export const getServiceDetailsDef: ToolDef = {
  type: "function",
  function: {
    name: "get_service_details",
    description: "Detalhes de um serviço: header + preço retail. service_id aceita UUID, SKU ou nome.",
    parameters: {
      type: "object",
      properties: { service_id: { type: "string" } },
      required: ["service_id"],
    },
  },
};

const getServiceDetails: Handler = async (ctx, args): Promise<ToolResult> => {
  const perm = requirePermission(ctx, "services.view", "ver serviços");
  if (perm) return perm;
  if (!isUuid(args?.service_id)) return { success: false, message: "service_id inválido." };

  const { data: s, error } = await ctx.supabase
    .from("services")
    .select(`
      id, sku, name, short_desc, long_desc, is_active, service_type,
      category:service_categories!services_service_category_id_fkey(id, name, path)
    `)
    .eq("id", args.service_id)
    .eq("organization_id", ctx.organizationId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return { success: false, message: error.message };
  if (!s) return { success: false, message: "Serviço não encontrado nesta organização." };

  const price = await fetchRetailPrice(ctx.supabase, "service", args.service_id);
  return { success: true, data: { ...s, price, link: `/services?open=${s.id}` } };
};

// ============================================================================
// search_bundles
// ============================================================================
export const searchBundlesDef: ToolDef = {
  type: "function",
  function: {
    name: "search_bundles",
    description: "Procura bundles por nome/SKU (min 2 chars). Só activos por defeito.",
    parameters: {
      type: "object",
      properties: {
        q: { type: "string" },
        limit: { type: "number" },
        only_active: { type: "boolean", description: "Default true." },
      },
      required: ["q"],
    },
  },
};

const searchBundles: Handler = async (ctx, args): Promise<ToolResult> => {
  const perm = requirePermission(ctx, "products.view", "ver bundles");
  if (perm) return perm;
  const q = String(args?.q ?? "").trim();
  if (q.length < 2) return { success: false, message: "q precisa de ≥2 caracteres." };
  const limit = Math.max(1, Math.min(25, Number(args?.limit) || 10));
  const onlyActive = args?.only_active !== false;
  const pat = `%${escapeIlike(q)}%`;

  let base = ctx.supabase
    .from("bundles")
    .select("id, sku, name, pricing_type, fixed_price, status, is_active")
    .eq("organization_id", ctx.organizationId)
    .is("deleted_at", null)
    .limit(50);
  if (onlyActive) base = base.eq("is_active", true).eq("status", "active");

  const [byName, bySku] = await Promise.all([
    base.ilike("name", pat),
    base.ilike("sku", pat),
  ]);
  const byId = new Map<string, any>();
  for (const r of [...(byName.data ?? []), ...(bySku.data ?? [])]) {
    if (r?.id && !byId.has(r.id)) byId.set(r.id, r);
  }
  const items = Array.from(byId.values())
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
    .slice(0, limit);
  return { success: true, data: { items, count: items.length, query: q } };
};

// ============================================================================
// get_bundle_details
// ============================================================================
export const getBundleDetailsDef: ToolDef = {
  type: "function",
  function: {
    name: "get_bundle_details",
    description:
      "Detalhes de um bundle: header + componentes resolvidos (nome + sku + tipo + quantidade + pricing_mode).",
    parameters: {
      type: "object",
      properties: { bundle_id: { type: "string" } },
      required: ["bundle_id"],
    },
  },
};

const getBundleDetails: Handler = async (ctx, args): Promise<ToolResult> => {
  const perm = requirePermission(ctx, "products.view", "ver bundles");
  if (perm) return perm;
  if (!isUuid(args?.bundle_id)) return { success: false, message: "bundle_id inválido." };

  const { data: b, error } = await ctx.supabase
    .from("bundles")
    .select(`
      id, sku, name, description, pricing_type, fixed_price, discount_percent, discount_fixed,
      status, is_active, valid_from, valid_to,
      bundle_components (
        id, quantity, pricing_mode, custom_price, custom_discount_percent, custom_discount_fixed,
        is_optional, choice_group_id, sort_order, product_id, service_id,
        product:products!bundle_components_product_id_fkey(id, sku, name),
        service:services!bundle_components_service_id_fkey(id, sku, name)
      )
    `)
    .eq("id", args.bundle_id)
    .eq("organization_id", ctx.organizationId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return { success: false, message: error.message };
  if (!b) return { success: false, message: "Bundle não encontrado nesta organização." };

  const components = ((b as any).bundle_components ?? [])
    .slice()
    .sort((a: any, b: any) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0))
    .map((c: any) => ({
      id: c.id,
      kind: c.product_id ? "product" : "service",
      ref_id: c.product_id ?? c.service_id,
      sku: c.product?.sku ?? c.service?.sku ?? null,
      name: c.product?.name ?? c.service?.name ?? null,
      quantity: Number(c.quantity ?? 1),
      pricing_mode: c.pricing_mode,
      is_optional: !!c.is_optional,
      choice_group_id: c.choice_group_id,
    }));
  const { bundle_components: _bc, ...header } = b as any;
  return {
    success: true,
    data: { ...header, components, link: `/bundles?open=${b.id}` },
  };
};

// ============================================================================
// list_categories
// ============================================================================
export const listCategoriesDef: ToolDef = {
  type: "function",
  function: {
    name: "list_categories",
    description:
      "Lista categorias de products ou services. parent_id opcional restringe a um nível; sem ele devolve toda a árvore activa.",
    parameters: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["product", "service"] },
        parent_id: { type: "string", description: "UUID ou 'root' para top-level." },
      },
      required: ["kind"],
    },
  },
};

const listCategories: Handler = async (ctx, args): Promise<ToolResult> => {
  const kind = args?.kind;
  if (kind !== "product" && kind !== "service") {
    return { success: false, message: "kind deve ser 'product' ou 'service'." };
  }
  const perm = requirePermission(
    ctx,
    kind === "product" ? "products.view" : "services.view",
    `ver categorias de ${kind}s`,
  );
  if (perm) return perm;
  const table = kind === "product" ? "product_categories" : "service_categories";

  let q = ctx.supabase
    .from(table)
    .select("id, parent_id, name, path, is_active, sort_order")
    .eq("organization_id", ctx.organizationId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .limit(500);
  if (args?.parent_id === "root") q = q.is("parent_id", null);
  else if (args?.parent_id && isUuid(args.parent_id)) q = q.eq("parent_id", args.parent_id);

  const { data, error } = await q;
  if (error) return { success: false, message: error.message };
  return { success: true, data: { items: data ?? [], count: data?.length ?? 0 } };
};

// ============================================================================
// get_product_price
// ============================================================================
export const getProductPriceDef: ToolDef = {
  type: "function",
  function: {
    name: "get_product_price",
    description:
      "Preço retail actual de um produto (real-time, nunca snapshot). context_id reservado para futuro — actualmente ignorado.",
    parameters: {
      type: "object",
      properties: {
        product_id: { type: "string" },
        context_id: { type: "string", description: "Opcional, reservado." },
      },
      required: ["product_id"],
    },
  },
};

const getProductPrice: Handler = async (ctx, args): Promise<ToolResult> => {
  const perm = requirePermission(ctx, "products.view", "consultar preços");
  if (perm) return perm;
  if (!isUuid(args?.product_id)) return { success: false, message: "product_id inválido." };
  // Confirma org
  const { data: p } = await ctx.supabase.from("products")
    .select("id, sku, name").eq("id", args.product_id)
    .eq("organization_id", ctx.organizationId).is("deleted_at", null).maybeSingle();
  if (!p) return { success: false, message: "Produto não encontrado nesta organização." };
  const price = await fetchRetailPrice(ctx.supabase, "product", args.product_id);
  if (price.price == null) {
    return { success: false, message: "Produto sem preço retail no catálogo." };
  }
  return {
    success: true,
    data: {
      product_id: p.id, sku: (p as any).sku, name: (p as any).name,
      base_price: price.price, currency: price.currency, vat_rate: price.vat_rate,
      context_id: args?.context_id ?? null,
    },
  };
};

// ============================================================================
// get_product_stock
// ============================================================================
export const getProductStockDef: ToolDef = {
  type: "function",
  function: {
    name: "get_product_stock",
    description: "Stock agregado de um produto. Devolve totais + breakdown por location.",
    parameters: {
      type: "object",
      properties: { product_id: { type: "string" } },
      required: ["product_id"],
    },
  },
};

const getProductStock: Handler = async (ctx, args): Promise<ToolResult> => {
  const perm = requirePermission(ctx, "products.view", "consultar stock");
  if (perm) return perm;
  if (!isUuid(args?.product_id)) return { success: false, message: "product_id inválido." };
  // Confirma org
  const { data: p } = await ctx.supabase.from("products")
    .select("id").eq("id", args.product_id)
    .eq("organization_id", ctx.organizationId).is("deleted_at", null).maybeSingle();
  if (!p) return { success: false, message: "Produto não encontrado nesta organização." };

  const { data: rows, error } = await ctx.supabase
    .from("product_stock")
    .select("location_id, qty_available, qty_reserved, qty_min, qty_max, location:locations(id, name)")
    .eq("product_id", args.product_id);
  if (error) return { success: false, message: error.message };
  const list = (rows ?? []) as any[];
  const available = list.reduce((s, r) => s + Number(r.qty_available || 0), 0);
  const reserved = list.reduce((s, r) => s + Number(r.qty_reserved || 0), 0);
  const on_hand = available + reserved;
  const by_location = list.map((r) => ({
    location_id: r.location_id,
    location_name: r.location?.name ?? null,
    available: Number(r.qty_available || 0),
    reserved: Number(r.qty_reserved || 0),
    qty_min: r.qty_min != null ? Number(r.qty_min) : null,
    qty_max: r.qty_max != null ? Number(r.qty_max) : null,
  }));
  return {
    success: true,
    data: { product_id: args.product_id, on_hand, available, reserved, by_location },
  };
};

// ============================================================================
// Fase 4.L — Marcas, atributos, UOM (leitura)
// ============================================================================

export const listBrandsDef: ToolDef = {
  type: "function",
  function: {
    name: "list_brands",
    description: "Lista marcas disponíveis nesta organização (via brand_organizations). Filtros opcionais: query (parcial em name), only_active (default true), limit (1-50, default 25).",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        only_active: { type: "boolean" },
        limit: { type: "number" },
      },
    },
  },
};

const listBrands: Handler = async (ctx, args): Promise<ToolResult> => {
  const perm = requirePermission(ctx, "brands.view", "ver marcas");
  if (perm) return perm;
  if (!ctx.organizationId) return { success: false, message: "Organização não definida." };
  const limit = Math.max(1, Math.min(50, Number(args?.limit) || 25));
  const onlyActive = args?.only_active !== false;

  const { data: links } = await ctx.supabase
    .from("brand_organizations")
    .select("brand_id")
    .eq("organization_id", ctx.organizationId);
  const ids = Array.from(new Set((links ?? []).map((r: any) => r.brand_id)));
  if (ids.length === 0) return { success: true, data: { items: [], count: 0 } };

  let q = ctx.supabase
    .from("brands")
    .select("id, name, slug, description, website, logo_url, is_active")
    .in("id", ids)
    .order("name", { ascending: true })
    .limit(limit);
  if (onlyActive) q = q.eq("is_active", true);
  if (args?.query && typeof args.query === "string" && args.query.trim().length > 0) {
    q = q.ilike("name", `%${escapeIlike(args.query.trim())}%`);
  }
  const { data, error } = await q;
  if (error) return { success: false, message: error.message };
  return { success: true, data: { items: data ?? [], count: data?.length ?? 0 } };
};

export const listProductAttributesDef: ToolDef = {
  type: "function",
  function: {
    name: "list_product_attributes",
    description: "Lista atributos de produto disponíveis (org + globais sem organization_id). Filtros opcionais: query (parcial em label/code), limit (1-50, default 25).",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "number" },
      },
    },
  },
};

const listProductAttributes: Handler = async (ctx, args): Promise<ToolResult> => {
  const perm = requirePermission(ctx, "product_attributes.view", "ver atributos de produto");
  if (perm) return perm;
  if (!ctx.organizationId) return { success: false, message: "Organização não definida." };
  const limit = Math.max(1, Math.min(50, Number(args?.limit) || 25));

  let q = ctx.supabase
    .from("product_attributes")
    .select("id, code, label, type, value_type, unit, is_variant_option, pricing_type, organization_id")
    .or(`organization_id.eq.${ctx.organizationId},organization_id.is.null`)
    .order("label", { ascending: true })
    .limit(limit);
  if (args?.query && typeof args.query === "string" && args.query.trim().length > 0) {
    const term = escapeIlike(args.query.trim());
    q = q.or(`label.ilike.%${term}%,code.ilike.%${term}%`);
  }
  const { data, error } = await q;
  if (error) return { success: false, message: error.message };
  return { success: true, data: { items: data ?? [], count: data?.length ?? 0 } };
};

export const getProductAttributeDetailsDef: ToolDef = {
  type: "function",
  function: {
    name: "get_product_attribute_details",
    description: "Detalhes de um atributo de produto, incluindo value_type, allowed_values, options e is_variant_option.",
    parameters: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
};

const getProductAttributeDetails: Handler = async (ctx, args): Promise<ToolResult> => {
  const perm = requirePermission(ctx, "product_attributes.view", "ver atributos de produto");
  if (perm) return perm;
  if (!isUuid(args?.id)) return { success: false, message: "id inválido." };
  if (!ctx.organizationId) return { success: false, message: "Organização não definida." };

  const { data, error } = await ctx.supabase
    .from("product_attributes")
    .select("id, code, label, type, value_type, unit, allowed_values, options, is_variant_option, is_filterable, is_required, pricing_type, price_per_unit, pricing_unit, organization_id")
    .eq("id", args.id)
    .or(`organization_id.eq.${ctx.organizationId},organization_id.is.null`)
    .maybeSingle();
  if (error) return { success: false, message: error.message };
  if (!data) return { success: false, message: "Atributo não encontrado nesta organização." };
  return { success: true, data };
};

export const listUnitsOfMeasureDef: ToolDef = {
  type: "function",
  function: {
    name: "list_units_of_measure",
    description: "Lista unidades de medida (uom) disponíveis. Inclui org + globais (organization_id IS NULL). Filtros opcionais: query (parcial em code/description), limit (1-50, default 25).",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "number" },
      },
    },
  },
};

const listUnitsOfMeasure: Handler = async (ctx, args): Promise<ToolResult> => {
  // UOM não tem permissão dedicada no router; é consumida pelo módulo Products.
  const perm = requirePermission(ctx, "products.view", "consultar unidades de medida");
  if (perm) return perm;
  if (!ctx.organizationId) return { success: false, message: "Organização não definida." };
  const limit = Math.max(1, Math.min(50, Number(args?.limit) || 25));

  let q = ctx.supabase
    .from("uom")
    .select("id, code, description, base_uom_id, conversion_factor, is_active, organization_id")
    .or(`organization_id.eq.${ctx.organizationId},organization_id.is.null`)
    .eq("is_active", true)
    .order("code", { ascending: true })
    .limit(limit);
  if (args?.query && typeof args.query === "string" && args.query.trim().length > 0) {
    const term = escapeIlike(args.query.trim());
    q = q.or(`code.ilike.%${term}%,description.ilike.%${term}%`);
  }
  const { data, error } = await q;
  if (error) return { success: false, message: error.message };
  return { success: true, data: { items: data ?? [], count: data?.length ?? 0 } };
};

// ============================================================================
export const handlers: Record<string, Handler> = {
  get_product_details: getProductDetails,
  search_services: searchServices,
  get_service_details: getServiceDetails,
  search_bundles: searchBundles,
  get_bundle_details: getBundleDetails,
  list_categories: listCategories,
  get_product_price: getProductPrice,
  get_product_stock: getProductStock,
  list_brands: listBrands,
  list_product_attributes: listProductAttributes,
  get_product_attribute_details: getProductAttributeDetails,
  list_units_of_measure: listUnitsOfMeasure,
};

