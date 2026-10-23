/**
 * Ligação "Pedido de Proposta → novo orçamento".
 *
 * O detalhe do negócio (Deals.tsx) abre /quotes com estes parâmetros; a página
 * Quotes.tsx lê-os, abre o QuoteBuilder com o pedido escolhido e, com
 * autoImport=1, o construtor corre UMA vez a mesma importação do botão
 * "Importar do pedido de proposta" (handleImportFromDeal).
 */

export const NEW_QUOTE_PARAM = "new";
export const PROPOSAL_ID_PARAM = "proposal_id";
export const DEAL_ID_PARAM = "deal_id";
export const AUTO_IMPORT_PARAM = "autoImport";

/** Permissão do botão "Novo Orçamento" em /quotes — usar a mesma fora dali. */
export const CREATE_QUOTE_PERMISSION = "quotes.create";

/** URL que abre o construtor de um orçamento novo para o pedido, já com as necessidades importadas. */
export function buildNewQuoteFromDealUrl(dealId: string, opts: { autoImport?: boolean } = {}): string {
  const params = new URLSearchParams();
  params.set(NEW_QUOTE_PARAM, "1");
  params.set(DEAL_ID_PARAM, dealId);
  if (opts.autoImport !== false) params.set(AUTO_IMPORT_PARAM, "1");
  return `/quotes?${params.toString()}`;
}

/** URL que abre o detalhe de um orçamento existente (deeplink ?open= de Quotes.tsx). */
export function buildOpenQuoteUrl(quoteId: string): string {
  return `/quotes?open=${encodeURIComponent(quoteId)}`;
}

/** Lê o pedido de importação automática dos parâmetros do URL. */
export function readAutoImportParam(params: URLSearchParams): boolean {
  return params.get(AUTO_IMPORT_PARAM) === "1";
}
