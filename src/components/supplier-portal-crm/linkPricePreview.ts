// Portal do Fornecedor F3.4b — prever, ao ligar um artigo do catálogo com
// "usar o preço do catálogo", se o custo do produto também muda. A regra é a
// de fn_price_change_cost_plan (contrato F3.4b, secção 2): o custo só muda se a
// ligação for a preferencial ativa, a unidade resolver e a moeda for a mesma.
// É só para o texto da opção: quem decide é a RPC, e o resultado real vem no
// retorno de rpc_catalog_link (mostrado no toast).
import { supabase } from "@/integrations/supabase/client";

export interface LinkPriceRow {
  id: string;
  uomId: string | null;
  /** is_preferred AND is_active (como a regra da BD). */
  isPreferred: boolean;
  supplierName: string | null;
}

export interface LinkPriceContext {
  rows: LinkPriceRow[];
  productUomId: string | null;
  /** product_prices purchase mais recente (custo unitário). */
  cost: { price: number; currency: string } | null;
}

/** Lê as ligações do produto, a unidade e o custo atual. null = não deu (texto genérico). */
export async function loadLinkPriceContext(productId: string): Promise<LinkPriceContext | null> {
  const [rowsRes, productRes, costRes] = await Promise.all([
    supabase
      .from("item_suppliers")
      .select("id, uom_id, is_preferred, is_active, supplier:supplier_id(name)")
      .eq("product_id", productId)
      .is("deleted_at", null),
    supabase.from("products").select("uom_id").eq("id", productId).maybeSingle(),
    supabase
      .from("product_prices")
      .select("price, currency, updated_at")
      .eq("product_id", productId)
      .eq("price_type", "purchase")
      .order("updated_at", { ascending: false })
      .limit(1),
  ]);
  if (rowsRes.error || productRes.error || costRes.error) return null;
  const rows: LinkPriceRow[] = (rowsRes.data ?? []).map((r) => {
    const sup = r.supplier as { name: string } | { name: string }[] | null;
    return {
      id: r.id,
      uomId: r.uom_id ?? null,
      isPreferred: !!r.is_preferred && r.is_active !== false,
      supplierName: (Array.isArray(sup) ? sup[0]?.name : sup?.name) ?? null,
    };
  });
  const c = (costRes.data ?? [])[0];
  return {
    rows,
    productUomId: productRes.data?.uom_id ?? null,
    cost: c && c.price != null ? { price: Number(c.price), currency: String(c.currency) } : null,
  };
}

const money2 = (v: number) => v.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

export const GENERIC_PRICE_EFFECT =
  "Atualiza o preço deste fornecedor; o custo do produto só muda se este for o fornecedor preferencial.";

/**
 * Texto da opção "usar o preço do catálogo".
 * targetRowId: linha item_suppliers que a ligação reaproveita; null = cria
 * uma nova; undefined = ainda não se sabe.
 * targetUomId: unidade da ligação nova (só quando targetRowId é null).
 */
export function describeCatalogPriceEffect(args: {
  basePrice: number;
  currency: string | null;
  ctx: LinkPriceContext | null;
  targetRowId: string | null | undefined;
  targetUomId?: string | null;
}): string {
  const { basePrice, ctx, targetRowId } = args;
  const currency = args.currency ?? "EUR";
  if (!ctx || targetRowId === undefined) return GENERIC_PRICE_EFFECT;

  let willBePreferred: boolean;
  let uomId: string | null | undefined;
  if (targetRowId === null) {
    // rpc_catalog_link: a ligação nova só é preferencial se o produto não tiver nenhuma.
    willBePreferred = ctx.rows.length === 0;
    uomId = args.targetUomId;
  } else {
    const row = ctx.rows.find((r) => r.id === targetRowId);
    if (!row) return GENERIC_PRICE_EFFECT;
    willBePreferred = row.isPreferred;
    uomId = row.uomId;
  }

  if (!willBePreferred) {
    const pref = ctx.rows.find((r) => r.isPreferred && r.id !== targetRowId);
    return pref?.supplierName
      ? `Atualiza só o preço deste fornecedor; o custo do produto vem do fornecedor preferencial (${pref.supplierName}) e não muda.`
      : "Atualiza só o preço deste fornecedor; o custo do produto não muda (este fornecedor não é o preferencial).";
  }
  if (ctx.cost && ctx.cost.currency !== currency) {
    return `Atualiza o preço deste fornecedor; o custo do produto está noutra moeda (${ctx.cost.currency}) e não muda.`;
  }
  // Unidade da ligação = unidade do produto (ou nenhuma): fator 1, dá para prever.
  const sameUnit = uomId === undefined ? false : !uomId || uomId === ctx.productUomId;
  if (!sameUnit) {
    return "Atualiza o preço deste fornecedor e o custo do produto (convertido para a unidade do produto).";
  }
  const next = round2(basePrice);
  if (!ctx.cost) return `Atualiza o preço deste fornecedor e o custo do produto (passa a ${money2(next)} ${currency}).`;
  if (round2(ctx.cost.price) === next) {
    return `Atualiza o preço deste fornecedor; o custo do produto já é ${money2(next)} ${currency}.`;
  }
  return `Atualiza o preço deste fornecedor e o custo do produto (${money2(ctx.cost.price)} → ${money2(next)} ${currency}).`;
}
