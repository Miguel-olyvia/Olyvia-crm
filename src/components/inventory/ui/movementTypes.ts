import type { InventoryTone } from "./tones";

// Tipos reais de stock_movements.movement_type (CHECK de
// 20261113260000_stock_movements_ledger.sql + 'venda'/'estorno_venda' de
// 20261115040000_sale_to_fixed_stock_data_foundation.sql). Os que somam ao
// stock são os mesmos de fn_stock_movements_apply (v_is_increment).
// Tons iguais ao MT do mockup: entrada ok, saída info, transferência violet,
// ajuste warn, devolução neu, quebra bad. Venda segue a saída; o estorno de
// venda (devolve stock) segue a entrada — não existem no mockup.
export const MOVEMENT_TYPES: Record<string, { label: string; tone: InventoryTone; increases: boolean }> = {
  entrada: { label: "Entrada", tone: "ok", increases: true },
  saida: { label: "Saída", tone: "info", increases: false },
  venda: { label: "Venda", tone: "info", increases: false },
  estorno_venda: { label: "Estorno de venda", tone: "ok", increases: true },
  transferencia_entrada: { label: "Transferência (entrada)", tone: "violet", increases: true },
  transferencia_saida: { label: "Transferência (saída)", tone: "violet", increases: false },
  ajuste_positivo: { label: "Ajuste (+)", tone: "warn", increases: true },
  ajuste_negativo: { label: "Ajuste (−)", tone: "warn", increases: false },
  devolucao_fornecedor: { label: "Devolução a fornecedor", tone: "neutral", increases: false },
  quebra: { label: "Quebra", tone: "bad", increases: false },
};

export const movementTypeLabel = (type: string) => MOVEMENT_TYPES[type]?.label ?? type;
export const movementTypeTone = (type: string): InventoryTone => MOVEMENT_TYPES[type]?.tone ?? "neutral";
export const movementIncreases = (type: string) => MOVEMENT_TYPES[type]?.increases ?? false;

/** Quantidade com sinal: o ledger guarda sempre quantity > 0 e o sentido vem do tipo. */
export const signedMovementQty = (type: string, quantity: number) =>
  movementIncreases(type) ? quantity : -quantity;
