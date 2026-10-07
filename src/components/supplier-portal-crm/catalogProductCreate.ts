// Criar um produto a partir de um artigo do catálogo do fornecedor (Portal do
// Fornecedor, lado do CRM) e ligá-lo logo a esse artigo.
//
// Não há utilitário partilhado para criar produtos: Products.tsx monta os
// argumentos de rpc_create_product dentro do handleSubmit. Aqui replica-se o
// mínimo dessa chamada (mesma RPC, mesmos argumentos, mesma forma de p_prices),
// sem fotos, atributos, packs nem withAuditContext — a RPC grava a sua própria
// linha de auditoria (fn_manual_audit_log, origem 'web_app').
//
// SKU: a BD não gera SKUs (rpc_create_product recebe p_sku tal como vem, não
// há sequência nem gatilho; Products.tsx exige-o à mão e, ao duplicar um
// produto, deixa-o vazio). Sugere-se a ref. do fornecedor normalizada e
// confirma-se a unicidade em (organization_id, sku) — o índice único
// products_sku_organization_id_key inclui produtos apagados.
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import { productSaveErrorMessage } from "@/components/receiving/productCodes";
import { callRpc, isNoPricePermission, type CatalogLinkResult, type CrmCatalogItem, type RpcError } from "./types";

export const SKU_MAX = 100;
export const NAME_MAX = 200;
export const DESCRIPTION_MAX = 2000;
export const BARCODE_MAX = 100;
/** Máximo de artigos por criação em lote. */
export const BULK_CREATE_LIMIT = 100;

export type ProductStatus = Database["public"]["Enums"]["product_status"];
export type ProductTypeValue = "sale" | "purchase" | "both";
type CurrencyCode = Database["public"]["Enums"]["currency_code"];

const CURRENCIES: CurrencyCode[] = ["EUR", "USD", "GBP", "BRL", "JPY", "CNY"];

export interface UomOption {
  id: string;
  code: string;
  description: string | null;
  organization_id: string | null;
}

export interface NamedOption {
  id: string;
  name: string;
}

export interface CategoryOption extends NamedOption {
  parent_id: string | null;
}

export interface CreateMeta {
  uoms: UomOption[];
  brands: NamedOption[];
  categories: CategoryOption[];
}

/**
 * Unidades base, marcas e categorias da organização do fornecedor (os produtos
 * ligáveis são os dessa organização). Só unidades base: fn_products_validate_uom
 * recusa uma embalagem como unidade do produto.
 */
export async function loadCreateMeta(organizationId: string): Promise<{ meta: CreateMeta | null; error: string | null }> {
  const [uomRes, catRes, brandOrgRes] = await Promise.all([
    supabase
      .from("uom")
      .select("id, code, description, organization_id")
      .eq("is_active", true)
      .is("base_uom_id", null)
      .or(`organization_id.eq.${organizationId},organization_id.is.null`)
      .order("code"),
    supabase
      .from("product_categories")
      .select("id, name, parent_id")
      .or(`organization_id.eq.${organizationId},organization_id.is.null`)
      .order("name"),
    // Marcas como em Products.tsx: via brand_organizations.
    supabase.from("brand_organizations").select("brand_id").eq("organization_id", organizationId),
  ]);
  const firstError = uomRes.error || catRes.error || brandOrgRes.error;
  if (firstError) return { meta: null, error: firstError.message };

  const brandIds = Array.from(new Set((brandOrgRes.data ?? []).map((r) => r.brand_id).filter(Boolean)));
  let brands: NamedOption[] = [];
  if (brandIds.length > 0) {
    const { data, error } = await supabase.from("brands").select("id, name").in("id", brandIds).order("name");
    if (error) return { meta: null, error: error.message };
    brands = (data ?? []) as NamedOption[];
  }
  return {
    meta: {
      uoms: (uomRes.data ?? []) as UomOption[],
      categories: (catRes.data ?? []) as CategoryOption[],
      brands,
    },
    error: null,
  };
}

const fold = (s: string | null | undefined) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.\s]+/g, " ")
    .trim();

/** Rótulos frequentes → códigos de unidade base, por ordem de preferência. */
const UNIT_ALIASES: Record<string, string[]> = {
  un: ["un", "ea", "pcs"], u: ["un", "ea", "pcs"], und: ["un", "ea", "pcs"], unid: ["un", "ea", "pcs"],
  uni: ["un", "ea", "pcs"], unidade: ["un", "ea", "pcs"], unidades: ["un", "ea", "pcs"], unit: ["un", "ea", "pcs"],
  ea: ["ea", "un", "pcs"], each: ["ea", "un", "pcs"], pc: ["pcs", "un", "ea"], pcs: ["pcs", "un", "ea"],
  // "pç"/"peça" chegam aqui já sem acentos (fold).
  peca: ["pcs", "un", "ea"], pecas: ["pcs", "un", "ea"],
  cx: ["box"], caixa: ["box"], caixas: ["box"], box: ["box"],
  emb: ["pkg"], embalagem: ["pkg"], pack: ["pkg"], pkg: ["pkg"],
  kg: ["kg"], quilo: ["kg"], kilo: ["kg"], g: ["g"], gr: ["g"], grama: ["g"], gramas: ["g"],
  l: ["l"], lt: ["l"], litro: ["l"], litros: ["l"], ml: ["ml"],
  m: ["m"], mt: ["m"], metro: ["m"], metros: ["m"], cm: ["cm"],
  m2: ["m2"], "m²": ["m2"], "metro quadrado": ["m2"], "metros quadrados": ["m2"],
};

const UNIT_LIKE = ["un", "ea", "pcs"];

/**
 * Unidade do produto a partir do rótulo do catálogo. Com units_per_pack > 1 o
 * rótulo é o da embalagem (ex.: "cx" de 12) e o produto conta-se à unidade.
 * Preferência pela unidade da organização; sem correspondência → null (a
 * unidade não é obrigatória em rpc_create_product).
 */
export function matchUom(item: Pick<CrmCatalogItem, "unit_label" | "units_per_pack">, uoms: UomOption[]): UomOption | null {
  const byCode = (code: string) => {
    const hits = uoms.filter((u) => fold(u.code) === code);
    return hits.find((u) => u.organization_id) ?? hits[0] ?? null;
  };
  const firstOf = (codes: string[]) => {
    for (const c of codes) {
      const hit = byCode(c);
      if (hit) return hit;
    }
    return null;
  };
  if ((item.units_per_pack ?? 0) > 1) return firstOf(UNIT_LIKE);
  const label = fold(item.unit_label);
  if (!label) return null;
  return (
    byCode(label) ??
    uoms.find((u) => fold(u.description) === label) ??
    firstOf(UNIT_ALIASES[label] ?? []) ??
    null
  );
}

/** Marca por nome (sem acentos nem maiúsculas). */
export function matchBrand(brand: string | null | undefined, brands: NamedOption[]): NamedOption | null {
  const key = fold(brand);
  if (!key) return null;
  return brands.find((b) => fold(b.name) === key) ?? null;
}

/** Ref. do fornecedor → SKU: maiúsculas, espaços a hífen, só [A-Z0-9._/-]. */
export function normalizeSkuBase(ref: string): string {
  const base = ref
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "-")
    .replace(/[^A-Z0-9._/-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  return base.slice(0, SKU_MAX);
}

/** Candidatos por ordem: BASE, BASE-2, …, BASE-9 (cortados a SKU_MAX). */
export function skuCandidates(base: string): string[] {
  if (!base) return [];
  const out = [base];
  for (let i = 2; i <= 9; i += 1) {
    const suffix = `-${i}`;
    out.push(`${base.slice(0, SKU_MAX - suffix.length)}${suffix}`);
  }
  return out;
}

/**
 * SKUs (de entre `skus`) já usados na organização. Igualdade exata, como o
 * índice único. Os produtos apagados podem não ser visíveis por RLS — se
 * escapar algum, o 23505 da gravação dá a mensagem certa.
 */
export async function findTakenSkus(organizationId: string, skus: string[]): Promise<{ taken: Set<string>; error: string | null }> {
  const list = Array.from(new Set(skus.map((s) => s.trim()).filter(Boolean)));
  if (list.length === 0) return { taken: new Set(), error: null };
  const taken = new Set<string>();
  // Em blocos, para o URL do PostgREST não crescer demais.
  for (let i = 0; i < list.length; i += 100) {
    const chunk = list.slice(i, i + 100);
    const { data, error } = await supabase
      .from("products")
      .select("sku")
      .eq("organization_id", organizationId)
      .in("sku", chunk);
    if (error) return { taken, error: error.message };
    (data ?? []).forEach((r) => { if (r.sku) taken.add(r.sku); });
  }
  return { taken, error: null };
}

/** Primeiro candidato livre (nem na BD nem já reservado no lote); senão a base. */
export function pickFreeSku(base: string, taken: Set<string>, reserved?: Set<string>): string {
  const free = skuCandidates(base).find((c) => !taken.has(c) && !reserved?.has(c));
  return free ?? base;
}

/** Validação dos campos que Products.tsx exige (productSchema). */
export function validateSku(sku: string): string | null {
  const s = sku.trim();
  if (!s) return "O SKU é obrigatório.";
  if (s.length > SKU_MAX) return `O SKU deve ter menos de ${SKU_MAX} caracteres.`;
  return null;
}

export function validateName(name: string): string | null {
  const s = name.trim();
  if (!s) return "O nome é obrigatório.";
  if (s.length > NAME_MAX) return `O nome deve ter menos de ${NAME_MAX} caracteres.`;
  return null;
}

/** "12,5" / "12.5" → 12.5; vazio → null; inválido → NaN. */
export function parseMoneyInput(raw: string): number | null {
  const s = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : Number.NaN;
}

const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

/**
 * Custo unitário do produto a partir do preço do catálogo. Com units_per_pack
 * > 1 o preço é o da embalagem: divide-se (como unitCostFromPackPrice).
 */
export function catalogUnitCost(item: Pick<CrmCatalogItem, "base_price" | "units_per_pack"> | null | undefined): number | null {
  if (!item || item.base_price == null) return null;
  const n = Number(item.units_per_pack ?? 0);
  return n > 1 ? round2(Number(item.base_price) / n) : round2(Number(item.base_price));
}

/** Moeda do catálogo se for uma das da BD; senão EUR. */
export function catalogCurrency(item: Pick<CrmCatalogItem, "currency"> | null | undefined): CurrencyCode {
  const c = (item?.currency ?? "").toUpperCase() as CurrencyCode;
  return CURRENCIES.includes(c) ? c : "EUR";
}

/**
 * Usar o preço do catálogo na ligação ao fornecedor? Só com can_view_pricing,
 * com can_manage_prices (F3.4b: rpc_catalog_link exige products.manage_prices
 * para usar o preço, senão recusa com no_price_permission e o produto ficava
 * criado sem ligação) e quando o artigo não é uma embalagem: rpc_catalog_link
 * grava base_price na linha item_suppliers na unidade do produto, e um preço de
 * caixa de 12 numa linha à unidade ficaria 12× acima.
 */
export function applyCatalogPriceOnLink(
  item: Pick<CrmCatalogItem, "units_per_pack"> | null | undefined,
  canViewPricing: boolean,
  canManagePrices = false,
): boolean {
  return !!item && canViewPricing && canManagePrices && !((item.units_per_pack ?? 0) > 1);
}

/**
 * F3.4b: com o preço do catálogo, a ligação (a primeira do produto novo, logo
 * a preferencial) também grava o custo do produto = preço do catálogo. Só se
 * usa quando o preço de compra escrito é esse mesmo valor — senão a ligação
 * substituía o custo que o utilizador acabou de escrever.
 */
export function linkPriceKeepsWrittenCost(
  item: Pick<CrmCatalogItem, "base_price" | "units_per_pack">,
  purchasePrice: number | null,
): boolean {
  const catalog = catalogUnitCost(item);
  if (catalog == null || purchasePrice == null || !Number.isFinite(purchasePrice)) return false;
  return round2(purchasePrice) === catalog;
}

export interface CreateProductInput {
  organizationId: string;
  supplierId: string;
  item: CrmCatalogItem;
  sku: string;
  name: string;
  description: string;
  barcode: string;
  brandId: string | null;
  categoryId: string | null;
  subcategoryId: string | null;
  uomId: string | null;
  status: ProductStatus;
  productType: ProductTypeValue;
  /** Custo unitário (product_prices.purchase); só enviado quando > 0. */
  purchasePrice: number | null;
  /** Preço de venda (product_prices.retail); só enviado quando > 0. */
  salePrice: number | null;
  currency: CurrencyCode;
  vatRate: number;
  /**
   * Preço do catálogo na ligação ao fornecedor (ver applyCatalogPriceOnLink).
   * Só é enviado se o preço de compra escrito for o do catálogo
   * (linkPriceKeepsWrittenCost).
   */
  applyCatalogPrice: boolean;
}

export type CreateOutcome =
  | { status: "error"; message: string; field?: "sku" | "barcode" }
  | { status: "created_not_linked"; productId: string; message: string }
  | {
      status: "linked";
      productId: string;
      result: CatalogLinkResult;
      /** Ligou sem o preço do catálogo (sem permissão ou preço escrito diferente). */
      priceNotApplied?: string;
    };

/** Mensagem clara para os erros de gravação (SKU/código de barras duplicado). */
export function createErrorMessage(err: RpcError | null | undefined, sku: string): { message: string; field?: "sku" | "barcode" } {
  const msg = (err?.message ?? "").trim();
  if (err?.code === "23505" && /products_sku_organization_id_key/i.test(msg)) {
    return {
      message: `Já existe um produto com o SKU «${sku}» nesta empresa (pode estar apagado). Escolhe outro SKU.`,
      field: "sku",
    };
  }
  if (err?.code === "23505" && /barcode|código de barras/i.test(msg)) {
    return { message: productSaveErrorMessage(err) || msg, field: "barcode" };
  }
  if (err?.code === "42501") return { message: msg || "Sem permissão para criar produtos." };
  return { message: productSaveErrorMessage(err) || msg || "Não foi possível criar o produto." };
}

/**
 * Cria o produto (rpc_create_product, como Products.tsx) e liga-o ao artigo do
 * catálogo (rpc_catalog_link). Não é atómico: se a ligação falhar o produto
 * fica criado e devolve-se "created_not_linked".
 */
export async function createProductFromCatalog(input: CreateProductInput): Promise<CreateOutcome> {
  const sku = input.sku.trim();
  const name = input.name.trim();
  const skuError = validateSku(sku);
  if (skuError) return { status: "error", message: skuError, field: "sku" };
  const nameError = validateName(name);
  if (nameError) return { status: "error", message: nameError };

  const { taken, error: takenError } = await findTakenSkus(input.organizationId, [sku]);
  if (takenError) return { status: "error", message: `Não foi possível verificar o SKU: ${takenError}` };
  if (taken.has(sku)) {
    return { status: "error", message: `Já existe um produto com o SKU «${sku}» nesta empresa.`, field: "sku" };
  }

  // Mesma forma que Products.tsx: só entradas com valor > 0.
  const prices = [
    { price_type: "purchase", value: input.purchasePrice },
    { price_type: "retail", value: input.salePrice },
  ]
    .filter((p) => p.value != null && Number.isFinite(p.value) && p.value > 0)
    .map((p) => ({ price_type: p.price_type, price: p.value, currency: input.currency, vat_rate: input.vatRate }));

  const args: Database["public"]["Functions"]["rpc_create_product"]["Args"] = {
    p_sku: sku,
    p_name: name,
    p_status: input.status,
    p_is_sellable: input.productType === "sale" || input.productType === "both",
    p_is_purchasable: input.productType === "purchase" || input.productType === "both",
    p_manages_stock: false,
    p_category_id: input.categoryId || null,
    p_subcategory_id: input.subcategoryId || null,
    // A organização do fornecedor: rpc_catalog_link só aceita produtos dela.
    p_primary_org_id: input.organizationId,
    p_uom_id: input.uomId || null,
    p_description: input.description.trim() || null,
    p_barcode: input.barcode.trim() || null,
    p_brand_id: input.brandId || null,
    // Como Products.tsx com "fornecedor inicial"; a linha item_suppliers
    // (preferencial, por ser a primeira) é criada pela ligação abaixo.
    p_supplier_id: input.supplierId,
    p_all_org_ids: [input.organizationId],
    p_prices: prices as unknown as Json,
    p_attribute_values: [] as unknown as Json,
  };

  const { data: newId, error } = await supabase.rpc("rpc_create_product", args);
  if (error || !newId) {
    const { message, field } = createErrorMessage(error as RpcError, sku);
    return { status: "error", message, field };
  }
  const productId = String(newId);

  let applyPrice = input.applyCatalogPrice && linkPriceKeepsWrittenCost(input.item, input.purchasePrice);
  let priceNotApplied: string | undefined =
    input.applyCatalogPrice && !applyPrice
      ? "O preço de compra escrito é diferente do catálogo: a ligação ao fornecedor ficou sem preço, para não mudar o custo."
      : undefined;
  const link1 = () =>
    callRpc<CatalogLinkResult>("rpc_catalog_link", {
      p_supplier_id: input.supplierId,
      p_catalog_item_id: input.item.id,
      p_product_id: productId,
      // Produto novo: não há linhas item_suppliers, a ligação cria uma na unidade do produto.
      p_uom_id: input.uomId || undefined,
      p_apply_catalog_price: applyPrice,
    });
  let { data: link, error: linkError } = await link1();
  // Sem products.manage_prices a RPC recusa ANTES de gravar o que quer que
  // seja: liga-se outra vez sem o preço (o custo já ficou no rpc_create_product).
  if (linkError && applyPrice && isNoPricePermission(linkError)) {
    applyPrice = false;
    priceNotApplied = linkError.message || "Sem permissão para alterar preços: ligado sem o preço do catálogo.";
    ({ data: link, error: linkError } = await link1());
  }
  if (linkError || !link) {
    return {
      status: "created_not_linked",
      productId,
      message: `Produto criado mas não ficou ligado — liga-o manualmente.${linkError?.message ? ` (${linkError.message})` : ""}`,
    };
  }
  return priceNotApplied ? { status: "linked", productId, result: link, priceNotApplied } : { status: "linked", productId, result: link };
}
