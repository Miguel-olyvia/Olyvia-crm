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

/**
 * Variante sem IVA de `getEffectiveContractValue`: mesma logica (prefere o
 * valor da quote ligada, com fallback para o valor guardado no contrato), mas
 * usando o valor sem IVA da quote e `contract.total_value_sem_iva` em vez dos
 * equivalentes com IVA. Nao inventa 0 nem assume uma taxa - devolve `null`
 * quando nenhum dos dois valores existe.
 *
 * O valor sem IVA real de uma quote e `subtotal + total_fees` (taxas de
 * servico, ja sem IVA — ver src/utils/quotes/computeQuoteTotals.ts), NAO
 * apenas `subtotal`: usar so subtotal excluiria o valor das taxas.
 */
export function getEffectiveContractValueExVat(contract: any): number | null {
  if (contract.quote_id) {
    const proposalQuotes: any[] = (contract.proposals as any)?.quotes ?? [];
    const linked = proposalQuotes.find((q: any) => q.id === contract.quote_id);
    if (linked?.subtotal != null) return Number(linked.subtotal) + Number(linked.total_fees ?? 0);
  }
  if (contract.total_value_sem_iva != null) return Number(contract.total_value_sem_iva);
  return null;
}

