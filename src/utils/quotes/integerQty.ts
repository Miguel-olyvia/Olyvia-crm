/**
 * Quantidades inteiras para unidades contáveis.
 *
 * Um produto cuja unidade de stock é contável (un, pcs, caixa…) ou uma linha
 * numa embalagem (uom_id preenchido — 1,5 × PK10 não existe) só aceita
 * quantidades inteiras. O stock conta-se sempre em unidades inteiras e uma
 * quantidade decimal numa destas linhas era truncada/arredondada mais à frente
 * sem ninguém dar por isso.
 *
 * Produtos sem unidade e unidades mensuráveis (m², ml, kg, hora…) mantêm
 * quantidades decimais. Linhas sem produto (serviços, texto livre) também.
 */

const INTEGER_UOM_CODES = new Set(["un", "ea", "pcs", "box", "pkg"]);

export function requiresIntegerQty(opts: {
  hasProduct: boolean;
  lineUomId?: string | null;
  baseUomCode?: string | null;
}): boolean {
  if (!opts.hasProduct) return false;
  // Linha numa embalagem: a quantidade conta embalagens inteiras.
  if (opts.lineUomId && opts.lineUomId.trim() !== "") return true;
  const code = opts.baseUomCode?.trim().toLowerCase();
  return !!code && INTEGER_UOM_CODES.has(code);
}

export function isValidQtyFor(qty: number, integer: boolean): boolean {
  if (!Number.isFinite(qty) || qty <= 0) return false;
  return integer ? Number.isInteger(qty) : true;
}

/**
 * Valor escrito no input → inteiro (Math.round). Um valor positivo que
 * arredondaria para 0 (ex. 0,3) passa a 1, para não apagar a linha em silêncio.
 * Valores não numéricos/negativos passam tal como vêm (a validação trata deles).
 */
export function roundToIntegerQty(value: number): number {
  if (!Number.isFinite(value)) return value;
  const rounded = Math.round(value);
  return rounded === 0 && value > 0 ? 1 : rounded;
}

/** Mensagem do toast quando uma linha contável ainda tem decimais ao gravar. */
export function integerQtyMessage(lineNumber: number | string, unitCode?: string | null): string {
  const unit = unitCode?.trim() ? unitCode.trim().toUpperCase() : "UN";
  return `A quantidade da linha ${lineNumber} tem de ser um número inteiro (unidade: ${unit})`;
}
