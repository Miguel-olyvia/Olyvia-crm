/**
 * Devolve o valor efectivo do contrato: prefere `quote.total` (inclui desconto
 * global) em vez de `contract.total_value`, que pode ter sido guardado sem o
 * desconto aplicado. Partilhado entre a lista/KPIs de Contratos e o Dashboard
 * de Contratos para que o mesmo contrato nunca mostre valores diferentes em
 * sítios diferentes da app.
 */
export function getEffectiveContractValue(contract: any): number {
  if (contract.quote_id) {
    const proposalQuotes: any[] = (contract.proposals as any)?.quotes ?? [];
    const linked = proposalQuotes.find((q: any) => q.id === contract.quote_id);
    if (linked?.total != null) return Number(linked.total);
  }
  return Number(contract.total_value) || 0;
}
