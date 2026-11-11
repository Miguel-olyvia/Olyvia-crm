// A base (rpc_delete_stock) recusa apagar uma linha de stock com quantidade: o stock só muda por movimentos.
// O ecrã desativa «Eliminar» nessas linhas e diz porquê (stocks.deleteNeedsZero), em vez de deixar carregar e receber o erro.
export interface StockDeleteAction {
  disabled: boolean;
  disabledReason: string | undefined;
}

export function stockDeleteAction(quantity: number | null | undefined, t: (key: string) => string): StockDeleteAction {
  const isZero = typeof quantity === "number" && quantity === 0;
  return { disabled: !isZero, disabledReason: isZero ? undefined : t("stocks.deleteNeedsZero") };
}
