/**
 * Para onde leva a acção "Ver orçamentos" do menu de um contrato
 * (src/pages/ClientContracts.tsx), e quando é que ela deve estar activa.
 *
 * Regra: comportar-se como o "Ver proposta" ao lado — quando há um único
 * orçamento, abrir esse orçamento; só quando há vários é que faz sentido levar
 * à lista filtrada pela proposta. Medido no remoto: dos contratos vivos com
 * orçamentos, a esmagadora maioria tem exactamente um, e levá-los a uma lista
 * de um item obrigava a um segundo clique para chegar ao mesmo sítio.
 *
 * Orçamentos apagados (`deleted_at` preenchido) não contam para nada: nem
 * activam o botão, nem são abertos, nem fazem passar de "um" para "vários".
 * A ficha de um orçamento apagado já não existe para quem a abre.
 */

export type ContractQuote = { id: string; deleted_at?: string | null };

export type ContractQuoteNavigationInput = {
  /** Orçamento do próprio contrato, quando existe. */
  quote_id?: string | null;
  /** `false` quando o `quote_id` aponta a um orçamento apagado. */
  _contractQuoteAlive?: boolean;
  proposal_id?: string | null;
  proposals?: { quotes?: ContractQuote[] | null } | null;
};

const liveProposalQuotes = (contract: ContractQuoteNavigationInput): ContractQuote[] =>
  (contract?.proposals?.quotes ?? []).filter((quote) => quote && !quote.deleted_at);

const liveContractQuoteId = (contract: ContractQuoteNavigationInput): string | null =>
  contract?.quote_id && contract._contractQuoteAlive !== false ? contract.quote_id : null;

/** O contrato tem algum orçamento por abrir? Se não, a acção fica desactivada. */
export function contractHasQuotes(contract: ContractQuoteNavigationInput): boolean {
  return Boolean(liveContractQuoteId(contract)) || liveProposalQuotes(contract).length > 0;
}

/**
 * Endereço a abrir: a ficha do orçamento quando há um só, a lista filtrada pela
 * proposta quando há vários.
 */
export function contractQuotesRoute(contract: ContractQuoteNavigationInput): string {
  const daProposta = liveProposalQuotes(contract);
  const unico = liveContractQuoteId(contract)
    ?? (daProposta.length === 1 ? daProposta[0].id : null);
  return unico ? `/quotes?open=${unico}` : `/quotes?proposal=${contract.proposal_id}`;
}
