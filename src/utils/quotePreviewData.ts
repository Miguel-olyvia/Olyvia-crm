type QuotePreviewInput = {
  formData: Record<string, any>;
  quoteId?: string | null;
  quoteNumber?: string | null;
  autoReference?: string | null;
  entityId?: string | null;
  obraEndereco?: string | null;
};

/**
 * quoteData da pre-visualizacao do orcamento. Leva o id do orcamento quando ja
 * esta gravado, para o contacto ser resolvido pelo RPC resolve_quote_contact
 * (o mesmo caminho do download); um rascunho por gravar fica sem id.
 */
export function buildQuotePreviewData(input: QuotePreviewInput): Record<string, any> {
  return {
    ...input.formData,
    id: input.quoteId ?? undefined,
    quote_number: input.quoteNumber || input.autoReference,
    created_at: new Date().toISOString(),
    entity_id: input.entityId,
    obra_endereco: input.obraEndereco,
  };
}
