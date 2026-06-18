/**
 * Catálogo explícito de campos numéricos disponíveis para usar em
 * células calculadas dentro de tabelas manuais de minutas (Corte 2C).
 *
 * Não depende de `documentVariables/registry.ts` ter `type`. Cada entrada
 * declara explicitamente se o valor é recolhido por `gatherContractData`
 * (enabled:true) ou se ainda está por implementar (enabled:false → aparece
 * desabilitado no popover com "em breve").
 *
 * `key` é a chave em `ContractVariableData` (sem `{{ }}`).
 */
export type ContractFormulaFieldType = "currency" | "number" | "percent";

export type ContractFormulaField = {
  key: string;
  label: string;
  type: ContractFormulaFieldType;
  enabled: boolean;
};

export const CONTRACT_FORMULA_FIELDS: ContractFormulaField[] = [
  { key: "contrato_valor",     label: "Valor total do contrato",   type: "currency", enabled: true  },
  { key: "orcamento_total",    label: "Valor total do orçamento",  type: "currency", enabled: false },
  { key: "orcamento_subtotal", label: "Subtotal do orçamento",     type: "currency", enabled: false },
  { key: "orcamento_iva",      label: "IVA do orçamento",          type: "currency", enabled: false },
];

export function getContractFormulaField(key: string): ContractFormulaField | undefined {
  return CONTRACT_FORMULA_FIELDS.find((f) => f.key === key);
}

export type FormulaOperation = "percent" | "factor" | "add" | "subtract";
export type FormulaFormat = "currency" | "percent" | "number";

/** Pure compute — used by both renderer and preview. */
export function computeFormulaResult(
  base: number,
  op: FormulaOperation,
  value: number,
): number {
  switch (op) {
    case "percent":  return base * (value / 100);
    case "factor":   return base * value;
    case "add":      return base + value;
    case "subtract": return base - value;
    default:         return base;
  }
}

/** pt-PT formatting reused by renderer. */
export function formatFormulaResult(n: number, format: FormulaFormat): string {
  if (!Number.isFinite(n)) return "";
  switch (format) {
    case "currency": {
      const f = Math.abs(n).toFixed(2);
      const [i, d] = f.split(".");
      const sign = n < 0 ? "-" : "";
      return `${sign}€${i.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${d}`;
    }
    case "percent":
      return `${n.toFixed(2).replace(".", ",")}%`;
    case "number":
    default:
      return n.toFixed(2).replace(".", ",");
  }
}

/** Human-readable preview label rendered inside the chip. */
export function describeFormulaChip(
  fieldLabel: string,
  op: FormulaOperation,
  value: number,
): string {
  const v = String(value).replace(".", ",");
  switch (op) {
    case "percent":  return `${v}% de ${fieldLabel}`;
    case "factor":   return `${fieldLabel} × ${v}`;
    case "add":      return `${fieldLabel} + ${v}`;
    case "subtract": return `${fieldLabel} − ${v}`;
    default:         return fieldLabel;
  }
}
