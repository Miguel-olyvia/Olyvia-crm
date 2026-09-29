/**
 * Packs na ficha do produto ("Compra-se em N un" / "Vende-se em N un").
 *
 * Contrato (rpc_set_product_packs):
 *  - O stock conta-se sempre na unidade do produto (products.uom_id).
 *  - Compra: a ligação preferida em item_suppliers guarda a unidade de compra
 *    (uom_id NULL = unidade do produto) e o purchase_price DESSA unidade — num
 *    pack de N, o preço do pack.
 *  - product_prices.purchase guarda SEMPRE o custo unitário (numeric(10,2)).
 *  - Venda: products.sale_uom_id é a unidade de venda por omissão; o preço de
 *    venda continua a ser unitário (o pack vale preço × N).
 *  - N = 1 significa "à unidade".
 */

/** Quantidade de um pack: inteiro ≥ 1 (1 por omissão). */
export function normalizePackQty(raw: unknown): number {
  const n = Math.trunc(Number(raw));
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

/** Arredondamento a 2 casas (product_prices.price é numeric(10,2)). */
const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

/**
 * Custo unitário a gravar em product_prices.purchase a partir do preço
 * escrito. Com N = 1 devolve o valor tal e qual (os produtos sem packs gravam
 * exatamente como antes).
 */
export function unitCostFromPackPrice(packPrice: number, qty: number): number {
  const n = normalizePackQty(qty);
  if (n === 1) return packPrice;
  return round2((Number(packPrice) || 0) / n);
}

/** Preço de um pack de N unidades a partir do preço unitário. */
export function packPriceFromUnit(unitPrice: number, qty: number): number {
  return round2((Number(unitPrice) || 0) * normalizePackQty(qty));
}

/** "1,23" — formato de preço em pt-PT com 2 casas. */
export function formatPackMoney(value: number): string {
  return (Number(value) || 0).toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Limite de "Compra-se em" / "Vende-se em" no formulário. */
export const MAX_PACK_QTY = 100000;

/**
 * Valida o que está escrito em "Compra-se em" / "Vende-se em" ANTES de gravar.
 * Vazio, 0, negativo, decimal ou não numérico é erro — não se normaliza para 1,
 * senão o preço escrito para o pack passava a ser gravado como unitário.
 * Devolve a mensagem de erro, ou null quando é um inteiro entre 1 e MAX_PACK_QTY.
 */
export function validatePackQtyInput(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === "") return "Indique a quantidade (1 = à unidade)";
  const n = typeof raw === "number" ? raw : Number(String(raw).trim().replace(",", "."));
  if (!Number.isFinite(n) || n === 0) return "Indique a quantidade (1 = à unidade)";
  if (!Number.isInteger(n)) return "A quantidade deve ser um número inteiro";
  if (n < 1) return "A quantidade mínima é 1";
  if (n > MAX_PACK_QTY) return "A quantidade é demasiado elevada";
  return null;
}

/** "0,004" — valor com as casas necessárias (até 6), para mostrar o custo exato. */
export function formatExactMoney(value: number): string {
  return (Number(value) || 0).toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
}

export interface PackUnitCostRounding {
  /** Custo por unidade exato (preço do pack ÷ N). */
  exactUnit: number;
  /** O que cabe em product_prices.price (numeric(10,2)). */
  storedUnit: number;
  /** Aviso não bloqueante, ou null quando o arredondamento não é relevante. */
  warning: string | null;
}

/**
 * Deteta quando o custo por unidade de um pack não cabe em cêntimos:
 * N ≥ 2 e (pack/N < 0,01 ou erro relativo do arredondamento > 1%).
 * Quando o arredondado dá 0, o custo não chega a ser enviado (só se gravam
 * preços > 0), por isso o aviso diz que o custo unitário não é atualizado.
 */
export function packUnitCostRounding(packPrice: number, qty: number): PackUnitCostRounding {
  const n = normalizePackQty(qty);
  const price = Number(packPrice) || 0;
  const exactUnit = n >= 2 ? price / n : price;
  const storedUnit = n >= 2 ? round2(exactUnit) : price;
  if (n < 2 || price <= 0 || exactUnit <= 0) return { exactUnit, storedUnit, warning: null };
  const relativeError = Math.abs(storedUnit - exactUnit) / exactUnit;
  if (exactUnit >= 0.01 && relativeError <= 0.01) return { exactUnit, storedUnit, warning: null };
  const warning = storedUnit > 0
    ? `O custo por unidade (${formatExactMoney(exactUnit)} €) não cabe em cêntimos; fica gravado ${formatPackMoney(storedUnit)} €. As margens das linhas usam este valor.`
    : `O custo por unidade (${formatExactMoney(exactUnit)} €) não cabe em cêntimos (daria 0,00 €); o custo unitário do produto não é atualizado. As margens das linhas usam o custo unitário que já estava gravado.`;
  return { exactUnit, storedUnit, warning };
}

/**
 * Custo por unidade de stock de uma ligação ao fornecedor: purchase_price é o
 * preço da unidade de compra da ligação (num pack de N, o preço do pack).
 */
export function supplierUnitCost(purchasePrice: number | null | undefined, unitsPerPurchaseUom: unknown): number | null {
  if (purchasePrice == null || !Number.isFinite(Number(purchasePrice))) return null;
  return Number(purchasePrice) / normalizePackQty(unitsPerPurchaseUom);
}

export interface ProductPackState {
  purchaseQty: number;
  saleQty: number;
}

/**
 * Quantidades efetivas: sem unidade de stock não há packs; sem fornecedor
 * preferido (ou sem permissão para ver custos) a compra é tratada como à
 * unidade no formulário.
 */
export function effectivePackQtys(input: {
  purchaseQty: unknown;
  saleQty: unknown;
  hasStockUom: boolean;
  purchaseEnabled: boolean;
}): ProductPackState {
  if (!input.hasStockUom) return { purchaseQty: 1, saleQty: 1 };
  return {
    purchaseQty: input.purchaseEnabled ? normalizePackQty(input.purchaseQty) : 1,
    saleQty: normalizePackQty(input.saleQty),
  };
}
