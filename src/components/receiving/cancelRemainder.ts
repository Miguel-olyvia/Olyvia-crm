// "Não vou receber o resto": os motivos da BD (rpc_cancel_po_line_remainder / rpc_cancel_po_remainder) e o "Danificado"
// do protótipo, que não existe na BD — vai como other com a nota "Danificado: …". Sem React.
export type CancelChoice = "found_stock" | "supplier_unavailable" | "damaged" | "other";

export const CANCEL_CHOICE_LABEL: Record<CancelChoice, string> = {
  found_stock: "Encontrei stock / outra solução",
  supplier_unavailable: "Fornecedor sem produto",
  damaged: "Danificado",
  other: "Outro",
};

/** Motivo e nota tal como vão para a BD. null = falta a nota obrigatória. */
/** Nota vazia vai como null (como em PurchaseOrders.tsx). */
export function cancelArgs(choice: CancelChoice, note: string): { reason: "found_stock" | "supplier_unavailable" | "other"; notes: string | null } | null {
  const n = note.trim();
  if (choice === "damaged") return { reason: "other", notes: n ? `Danificado: ${n}` : "Danificado" };
  if (choice === "other") return n ? { reason: "other", notes: n } : null;
  return { reason: choice, notes: n || null };
}
