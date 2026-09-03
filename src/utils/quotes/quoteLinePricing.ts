/**
 * Preço de uma linha de orçamento — fonte única de verdade.
 *
 * Antes desta fonte única, a fórmula do preço unitário estava copiada em 16
 * sítios (construtor de orçamentos, construtor inline, barra lateral, PDF,
 * pré-visualização, gravação, Edge Functions). Cada cópia divergia num
 * pormenor, e nenhuma arredondava o preço unitário antes de o multiplicar
 * pela quantidade — daí subtotais que não fechavam com o preço mostrado
 * (ex.: 51 × 7,10 mostrado, 362,00 gravado em vez de 362,10).
 *
 * Regras, por ordem:
 *  1. Se o artigo tem PREÇO DE VENDA DEFINIDO (`retail_price_unit`), é esse o
 *     preço unitário. Não se reconstrói a partir do custo e da margem.
 *  2. Sem preço de venda definido, o preço é o custo acrescido do markup
 *     (`margem_percent`) e da comissão de intermediação (`int_percent`).
 *  3. O preço unitário é sempre fechado ao cêntimo ANTES de multiplicar pela
 *     quantidade, para que o subtotal feche com o que está no ecrã.
 */

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** Campos de preço de que uma linha precisa. Aceita linhas da UI e da base. */
export interface PricedQuoteLine {
  qt?: number | string | null;
  custo_material_unit?: number | string | null;
  custo_mao_obra_unit?: number | string | null;
  margem_percent?: number | string | null;
  int_percent?: number | string | null;
  discount_percent?: number | string | null;
  /** Preço de venda definido do artigo, ou preço introduzido à mão. */
  retail_price_unit?: number | string | null;
}

const num = (v: number | string | null | undefined): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
};

/** Custo unitário total da linha (material + mão de obra). */
export const getLineUnitCost = (line: PricedQuoteLine): number =>
  num(line.custo_material_unit) + num(line.custo_mao_obra_unit);

/** Verdadeiro quando a linha tem um preço de venda definido a mandar no preço. */
export const hasDefinedSalePrice = (line: PricedQuoteLine): boolean =>
  line.retail_price_unit !== undefined && line.retail_price_unit !== null && num(line.retail_price_unit) > 0;

/**
 * Preço unitário de venda da linha, fechado ao cêntimo.
 * O preço de venda definido manda sempre; só na sua ausência é que o preço
 * é construído a partir do custo e do markup.
 */
export function getLineUnitPrice(line: PricedQuoteLine): number {
  if (hasDefinedSalePrice(line)) return round2(num(line.retail_price_unit));
  const custoUnit = getLineUnitCost(line);
  if (custoUnit === 0) return 0;
  return round2(custoUnit * (1 + num(line.margem_percent) / 100) * (1 + num(line.int_percent) / 100));
}

/** Subtotal da linha sem IVA, já com o desconto da própria linha. */
export function getLineSubtotal(line: PricedQuoteLine): number {
  const qt = num(line.qt);
  if (qt <= 0) return 0;
  return round2(getLineUnitPrice(line) * qt * (1 - num(line.discount_percent) / 100));
}

/**
 * Markup sobre o CUSTO que reproduz um dado preço de venda —
 * é isto que a coluna `margem_percent` sempre foi, estruturalmente:
 * um multiplicador do custo, não uma margem.
 *
 * Isto é o INVERSO de `getLineUnitPrice`, e tem de continuar a ser: o preço de
 * venda definido manda enquanto o orçamento está aberto, mas NÃO é gravado --
 * `retail_price_unit` não existe na base, só no ecrã. O que sobrevive a gravar
 * e reabrir é o custo e este markup, e é daí que o preço é reconstruído. Se a
 * inversão não fechar, o preço muda sozinho ao reabrir o orçamento.
 *
 * Por isso `intPercent` entra na conta: o preço leva a comissão de
 * intermediação por cima do markup, logo o markup que reproduz o preço tem de
 * a descontar primeiro. Ignorá-la devolvia o preço inflacionado pela comissão
 * uma segunda vez, ao reabrir.
 */
export function markupFromCostAndPrice(cost: number, price: number, intPercent: number = 0): number {
  if (!(cost > 0) || !(price > 0)) return 0;
  const semIntermediacao = price / (1 + num(intPercent) / 100);
  return Math.max(0, round2((semIntermediacao / cost - 1) * 100));
}

/**
 * Margem sobre o PREÇO — a definição única mostrada ao utilizador.
 * É a mesma que a ficha do produto usa (`calculateMargin` em
 * `productsExportImport.ts`): (preço − custo) / preço.
 */
export function marginOnPrice(cost: number, price: number): number {
  if (!(price > 0)) return 0;
  if (!(cost > 0)) return 100;
  return round2(((price - cost) / price) * 100);
}

/** Margem sobre o preço de uma linha, a partir do seu custo e preço unitário. */
export const getLineMarginPercent = (line: PricedQuoteLine): number =>
  marginOnPrice(getLineUnitCost(line), getLineUnitPrice(line));
