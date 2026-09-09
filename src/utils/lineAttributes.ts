/**
 * Leitura segura de `quote_lines.selected_attributes` para apresentação na UI.
 *
 * O contrato de escrita está documentado em `LineAttributesDialog.tsx`:
 *   { [attribute_id]: { attribute_code, label, value, value_type, unit? } }
 *
 * Tudo o resto guardado no mesmo JSON é estrutura interna e NÃO é um atributo
 * do utilizador — em dados reais existem, por exemplo, `bundle_components`
 * (lista de componentes internos, com sku e unit_price) e `iva_override`
 * (número de configuração de preço).
 *
 * A regra é sobre a FORMA do valor, não sobre uma lista de nomes: só é
 * apresentada uma entrada cujo valor seja um objeto com um `value` escalar
 * legível. Arrays, escalares soltos e objetos sem `value` são ignorados.
 * `JSON.stringify` nunca chega à UI.
 */

export interface DisplayAttribute {
  /** Chave original no JSON (habitualmente o attribute_id). Estável para React keys. */
  key: string;
  /** Etiqueta legível a mostrar ao utilizador. */
  label: string;
  /** Valor já formatado, incluindo unidade quando existe. */
  text: string;
}

type UnknownRecord = Record<string, unknown>;

const isPlainObject = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Um valor só é apresentável se for escalar e não vazio. */
const toDisplayText = (value: unknown): string | null => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : null;
  }

  if (typeof value === "boolean") {
    return value ? "Sim" : "Não";
  }

  return null;
};

const toLabel = (raw: unknown): string | null => {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
};

/**
 * Converte `selected_attributes` na lista de atributos apresentáveis.
 * Devolve sempre um array (vazio quando não há nada legível).
 */
export function getDisplayAttributes(
  selectedAttributes: unknown,
): DisplayAttribute[] {
  if (!isPlainObject(selectedAttributes)) return [];

  const result: DisplayAttribute[] = [];

  for (const [key, raw] of Object.entries(selectedAttributes)) {
    // Estrutura interna (bundle_components, ...) e escalares de configuração
    // (iva_override, ...) não são atributos: só objetos no formato do contrato.
    if (!isPlainObject(raw)) continue;

    const text = toDisplayText(raw.value);
    if (text === null) continue;

    const label = toLabel(raw.label) ?? toLabel(raw.attribute_code);
    if (label === null) continue;

    const unit = toLabel(raw.unit);
    result.push({ key, label, text: unit ? `${text} ${unit}` : text });
  }

  return result;
}
