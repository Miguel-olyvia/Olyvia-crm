// Códigos aprendidos (Fase 2 — fatia 3): tipos e chamadas às RPCs
// (migration 20261210100000_aprender_codigos). As RPCs devolvem Json: as
// interfaces abaixo descrevem esse jsonb (fn_product_code_json + campos da RPC).
import { supabase } from "@/integrations/supabase/client";

export type ProductCodeKind = "barcode" | "supplier_ref";

export interface RpcErrorLike {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
}

/** Resumo de um código devolvido por fn_product_code_json (+ campos da RPC). */
export interface ProductCodeSummary {
  id: string | null;
  code: string;
  code_key: string | null;
  kind: ProductCodeKind;
  product_id: string;
  product_name: string | null;
  sku: string | null;
  uom_id: string | null;
  uom_code: string | null;
  is_pack: boolean;
  units_per_uom: number | null;
  supplier_id: string | null;
  supplier_name?: string | null;
  source?: string | null;
  created_by?: string | null;
  created_at?: string | null;
  deleted_at?: string | null;
}

/** Retorno de rpc_product_code_learn. */
export interface LearnCodeResult extends ProductCodeSummary {
  replayed: boolean;
  /** true = associação nova gravada; false = já existia (ver `already`). */
  learned: boolean;
  /** Já era deste produto: código principal, código aprendido ou referência na ficha. */
  already: "product_barcode" | "product_code" | "item_supplier" | null;
  product_uom_set: boolean;
  annulled: string[];
  warnings: string[];
  /**
   * true = o produto não tinha código principal e a RPC gravou este código de
   * barras também em products.barcode (migration posterior à fatia 3).
   * Ausente em BDs sem essa migration → o cliente não mexe no campo da ficha.
   */
  main_barcode_set?: boolean;
}

/** Retorno de rpc_product_code_remove. */
export interface RemoveCodeResult extends ProductCodeSummary {
  removed: boolean;
  already_removed: boolean;
  scans_using_code: number;
  /**
   * true = o código removido era (mesma chave) o principal e a RPC limpou
   * products.barcode. Ausente em BDs sem essa migration → o cliente não mexe.
   */
  main_barcode_cleared?: boolean;
}

/** Linha de product_codes lida diretamente (RLS: org + products.view ou purchase_orders.receive). */
export interface ProductCodeRow {
  id: string;
  code: string;
  kind: ProductCodeKind;
  uom_id: string | null;
  supplier_id: string | null;
  source: string;
  created_by: string | null;
  created_at: string;
  uom: { code: string | null; conversion_factor: number | null } | null;
  suppliers: { name: string | null } | null;
}

export interface LearnCodeArgs {
  id: string;
  warehouseId: string | null;
  code: string;
  kind: ProductCodeKind;
  productId: string;
  uomId: string | null;
  supplierId: string | null;
  setProductUom: boolean;
}

export function newCodeRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Só dígitos com 8–14 → código de barras (EAN/DUN); o resto parece uma referência. */
export function looksLikeBarcode(code: string): boolean {
  return /^[0-9]{8,14}$/.test(code.trim());
}

/**
 * Espelho de fn_product_code_key (BD): btrim; só dígitos 8–14 → lpad 14 com
 * zeros (GTIN, zeros à esquerda ignorados); resto → minúsculas. Vazio → null.
 */
export function productCodeKey(code: string | null | undefined): string | null {
  const c = (code ?? "").replace(/^ +| +$/g, "");
  if (c === "") return null;
  return /^[0-9]{8,14}$/.test(c) ? c.padStart(14, "0") : c.toLowerCase();
}

export async function learnProductCode(a: LearnCodeArgs): Promise<{ data: LearnCodeResult | null; error: RpcErrorLike | null }> {
  try {
    const { data, error } = await supabase.rpc("rpc_product_code_learn", {
      p_id: a.id,
      // Sem DEFAULT na função, mas NULL é válido (= ficha do produto); o tipo
      // gerado não o exprime, daí o cast só neste argumento.
      p_warehouse_id: a.warehouseId as string,
      p_code: a.code,
      p_kind: a.kind,
      p_product_id: a.productId,
      p_uom_id: a.uomId ?? undefined,
      p_supplier_id: a.supplierId ?? undefined,
      p_set_product_uom: a.setProductUom,
    });
    if (error) return { data: null, error };
    return { data: (data ?? null) as unknown as LearnCodeResult | null, error: null };
  } catch (ex) {
    return { data: null, error: { message: String(ex) } };
  }
}

export async function removeProductCode(id: string, reason: string): Promise<{ data: RemoveCodeResult | null; error: RpcErrorLike | null }> {
  try {
    const { data, error } = await supabase.rpc("rpc_product_code_remove", { p_id: id, p_reason: reason });
    if (error) return { data: null, error };
    return { data: (data ?? null) as unknown as RemoveCodeResult | null, error: null };
  } catch (ex) {
    return { data: null, error: { message: String(ex) } };
  }
}

export async function fetchProductCodes(productId: string): Promise<{ rows: ProductCodeRow[]; error: RpcErrorLike | null }> {
  try {
    const { data, error } = await supabase
      .from("product_codes")
      .select("id, code, kind, uom_id, supplier_id, source, created_by, created_at, uom:uom_id(code, conversion_factor), suppliers:supplier_id(name)")
      .eq("product_id", productId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    if (error) return { rows: [], error };
    // kind é text na BD (CHECK barcode|supplier_ref) → estreita-se aqui.
    return {
      rows: (data ?? []).map((r) => ({ ...r, kind: r.kind === "supplier_ref" ? "supplier_ref" : "barcode" })),
      error: null,
    };
  } catch (ex) {
    return { rows: [], error: { message: String(ex) } };
  }
}

const MISSING_DB = new Set(["PGRST202", "PGRST205", "42P01", "42883"]);

/**
 * Mensagem para o utilizador. As mensagens do servidor já são claras (23505
 * traz o produto: «O código de barras «X» já é o código do produto «Y» (SKU)»),
 * exceto a do índice único em bruto ("duplicate key value…"), que se troca.
 */
export function productCodeErrorMessage(err: RpcErrorLike | null | undefined): string {
  if (!err) return "Erro desconhecido.";
  if (err.code && MISSING_DB.has(err.code)) {
    return "Os códigos aprendidos ainda não estão disponíveis (base de dados por atualizar).";
  }
  const msg = (err.message ?? "").trim();
  if (err.code === "23505" && (msg === "" || /duplicate key value/i.test(msg))) {
    return "Este código já está associado a outro produto ativo da empresa.";
  }
  if (!err.code) {
    return "Sem ligação ao servidor. A associação pode ter ficado gravada — tenta de novo (não fica repetida).";
  }
  return msg || "Não foi possível concluir a operação.";
}

/**
 * Erro ao criar/editar um produto: o gatilho de products devolve 23505 com o
 * nome do produto que já tem o código; o índice único (rede de segurança)
 * devolve texto em bruto — esse troca-se por uma frase clara.
 */
export function productSaveErrorMessage(err: RpcErrorLike | null | undefined): string {
  const msg = (err?.message ?? "").trim();
  if (err?.code === "23505" && /uq_products_barcode_key/i.test(msg)) {
    return "Este código de barras já está noutro produto ativo da empresa (como código principal ou código associado).";
  }
  return msg;
}

/** Frase curta para o toast depois de aprender um código. */
export function describeLearnResult(r: LearnCodeResult): string {
  const prod = r.product_name ? `«${r.product_name}»` : "o produto";
  const pack = r.is_pack && r.units_per_uom ? ` (${r.uom_code ?? "embalagem"} de ${r.units_per_uom})` : "";
  let base: string;
  switch (r.already) {
    case "product_barcode":
      base = `«${r.code}» já é o código de barras principal de ${prod}.`;
      break;
    case "product_code":
      base = `«${r.code}» já estava associado a ${prod}${pack}.`;
      break;
    case "item_supplier":
      base = `«${r.code}» já é a referência deste fornecedor na ficha de ${prod}.`;
      break;
    default:
      base = `«${r.code}» passa a ser reconhecido como ${prod}${pack}.`;
  }
  const extra = [r.product_uom_set ? "A unidade do produto passou a «un»." : null, ...(r.warnings ?? [])].filter(Boolean);
  return extra.length > 0 ? `${base} ${extra.join(" ")}` : base;
}
