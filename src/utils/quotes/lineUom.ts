/**
 * Unidade da linha (embalagens / "unidades com quantidade").
 *
 * Contrato (migrations 20261204201500 / 20261204202500 / 20261204204500):
 *  - O stock conta-se SEMPRE na unidade do produto (products.uom_id).
 *  - Uma embalagem é uma linha de `uom` com base_uom_id = unidade do produto e
 *    conversion_factor inteiro >= 2 (ex. PK10 = 10 × un).
 *  - A linha grava `uom_id` (NULL = unidade do produto); `units_per_uom` é
 *    calculado pelo gatilho no servidor e NUNCA é enviado. Com `uom_id` o
 *    gatilho alinha também o texto `unidade` com o código da uom.
 *
 * Regra de preço (decidida pelo utilizador): o preço de uma embalagem é SEMPRE
 * o preço unitário do produto × fator — não há preço próprio do pack. O custo
 * escala pelo mesmo fator, para a margem da linha bater certo.
 *
 * Ao trocar de unidade a fonte da verdade é o valor ATUAL da linha:
 *   novo = (valor atual ÷ fator atual) × fator novo
 * Assim um preço escrito à mão (ex. desconto no pack) é preservado
 * proporcionalmente e voltar à base divide pelo fator certo. Campos sem valor
 * numérico (ex. retail_price_unit NULL) ficam como estão. As contas guardam 6
 * casas decimais (sem ruído de vírgula flutuante e sem perder custos abaixo do
 * cêntimo); o arredondamento a 2 casas é feito no cálculo do preço/subtotal
 * (quoteLinePricing.round2), como no resto do editor. As linhas antigas nunca
 * são recalculadas ao abrir, só quando o utilizador muda a unidade.
 */

export interface UomCatalogRow {
  id: string;
  code: string;
  description: string | null;
  base_uom_id: string | null;
  conversion_factor: number | null;
}

export interface LineUomOption {
  /** id da uom (para a unidade base é o products.uom_id). */
  id: string;
  code: string;
  description: string | null;
  /** Unidades de stock por 1 unidade desta opção (1 na base). */
  factor: number;
  isBase: boolean;
}

/** Campos de unidade que as linhas editáveis passam a transportar. */
export interface LineUomFields {
  uom_id?: string | null;
  /** Fator da linha (snapshot do servidor ao carregar; da opção ao escolher). Só para o UI. */
  units_per_uom?: number;
}

/** Campos de preço/custo por unidade das linhas de orçamento e venda direta. */
export const LINE_PRICE_FIELDS = [
  "custo_material_unit",
  "custo_mao_obra_unit",
  "cost_price",
  "retail_price_unit",
] as const;

/** valor × fator sem ruído de vírgula flutuante (0,1 × 3 = 0,3, não 0,30000000000000004). */
const scale = (value: number, factor: number): number =>
  Math.round(value * factor * 1e6) / 1e6;

const toFactor = (raw: unknown): number => {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? n : 1;
};

/**
 * Opções do seletor "Unidade" para um produto: a unidade do produto seguida
 * das embalagens cuja base é essa unidade (por fator crescente). Devolve []
 * quando o produto não tem unidade — aí não há seletor.
 */
export function buildLineUomOptions(
  productUomId: string | null | undefined,
  uoms: UomCatalogRow[],
): LineUomOption[] {
  if (!productUomId) return [];
  const base = uoms.find((u) => u.id === productUomId);
  if (!base) return [];
  const packs = uoms
    .filter((u) => u.base_uom_id === productUomId && toFactor(u.conversion_factor) >= 2)
    .map<LineUomOption>((u) => ({
      id: u.id,
      code: u.code,
      description: u.description,
      factor: Math.trunc(toFactor(u.conversion_factor)),
      isBase: false,
    }))
    .sort((a, b) => a.factor - b.factor || a.code.localeCompare(b.code));
  return [
    { id: base.id, code: base.code, description: base.description, factor: 1, isBase: true },
    ...packs,
  ];
}

/** Fator atual da linha (1 quando não tem embalagem). */
export const getLineUnitsPerUom = (line: LineUomFields): number =>
  line.uom_id ? toFactor(line.units_per_uom) : 1;

/**
 * Aplica uma opção de unidade à linha: cada campo numérico indicado passa a
 * (valor atual ÷ fator atual) × fator novo; `unidade` = código da opção,
 * `uom_id` = id da embalagem (NULL na base). Campos null/não numéricos ficam.
 */
export function applyUomOptionToLine<T extends LineUomFields>(
  line: T,
  option: LineUomOption,
  fields: readonly string[] = LINE_PRICE_FIELDS,
): T {
  const currentFactor = getLineUnitsPerUom(line);
  const ratio = option.factor / currentFactor;
  const next = { ...(line as unknown as Record<string, unknown>) };
  for (const field of fields) {
    const value = next[field];
    if (typeof value === "number" && Number.isFinite(value)) next[field] = scale(value, ratio);
  }
  next.uom_id = option.isBase ? null : option.id;
  next.units_per_uom = option.factor;
  next.unidade = option.code;
  return next as unknown as T;
}

/**
 * Atualiza valores de preço/custo expressos na unidade BASE numa linha que
 * pode estar numa embalagem (ex.: recálculo por atributos): grava valor × fator
 * da linha (na base, fator 1, é um set direto).
 */
export function setLineBasePrices<T extends LineUomFields>(
  line: T,
  basePrices: Record<string, number>,
): T {
  const factor = getLineUnitsPerUom(line);
  const next = { ...(line as unknown as Record<string, unknown>) };
  for (const [field, value] of Object.entries(basePrices)) {
    next[field] = factor === 1 ? value : scale(value, factor);
  }
  return next as unknown as T;
}

/** Remove a embalagem de uma linha cujo artigo mudou (substituição de produto/bundle). */
export const clearLineUom = <T extends LineUomFields>(line: T): T => ({
  ...line,
  uom_id: null,
  units_per_uom: 1,
});

const formatQty = (n: number): string =>
  n.toLocaleString("pt-PT", { maximumFractionDigits: 3 });

/** "2 × PK10 = 20 un" — ou null quando a linha não está numa embalagem. */
export function formatPackBreakdown(
  qt: number | null | undefined,
  packCode: string | null | undefined,
  factor: number,
  baseCode: string | null | undefined,
): string | null {
  if (!(factor > 1)) return null;
  const q = Number(qt) || 0;
  const left = `${formatQty(q)} × ${packCode || "emb."}`;
  return `${left} = ${formatQty(q * factor)}${baseCode ? ` ${baseCode}` : ""}`;
}

/**
 * Quantidade de uma linha da Encomenda de Cliente: "2 PK10" e, com fator > 1,
 * a equivalência em unidades de stock ("= 20 un"). `stockQuantity` é o
 * `quantity` da RPC, já em unidades de stock.
 */
export function formatOrderLineQuantity(line: {
  quantity: number;
  line_quantity?: number | null;
  unidade?: string | null;
  units_per_uom?: number | null;
  stock_unidade?: string | null;
}): { main: string; stock: string | null } {
  const factor = toFactor(line.units_per_uom);
  const lineQty = factor > 1
    ? (line.line_quantity != null ? Number(line.line_quantity) : Number(line.quantity) / factor)
    : Number(line.quantity);
  const unidade = line.unidade?.trim();
  const main = `${formatQty(lineQty)}${unidade ? ` ${unidade}` : ""}`;
  const stock = factor > 1
    ? `= ${formatQty(Number(line.quantity))}${line.stock_unidade ? ` ${line.stock_unidade}` : " un. de stock"}`
    : null;
  return { main, stock };
}
