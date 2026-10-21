// Como o editor de orçamentos grava um orçamento NOVO a partir de um negócio (fecho v4, migration E): `neg_criar_orcamento` faz o mesmo que
// `rpc_save_quote` e o orçamento nasce já ligado ao negócio. Sem negócio, ou ao editar um orçamento que já existe, grava-se como sempre.
// Puro (sem rede) para se testar sem montar o editor, que tem milhares de linhas.

export type GravacaoDeOrcamento = "rpc_save_quote" | "neg_criar_orcamento";

export function escolherGravacaoDeOrcamento({ quoteId, criarNoNegocioId }: { quoteId: string | null; criarNoNegocioId?: string }): GravacaoDeOrcamento {
  return criarNoNegocioId && !quoteId ? "neg_criar_orcamento" : "rpc_save_quote";
}

export interface DadosDoOrcamento {
  quoteData: unknown;
  lines: unknown;
  fees: unknown;
  totals: unknown;
}

/** Os parâmetros de `neg_criar_orcamento`: os de `rpc_save_quote` (menos o id, que aqui nasce) mais o negócio. */
export function parametrosNegCriarOrcamento(negocioId: string, d: DadosDoOrcamento) {
  return {
    p_negocio_id: negocioId, p_quote_data: d.quoteData, p_lines: d.lines, p_fees: d.fees, p_totals: d.totals,
    p_inline_quotes: [] as unknown[], p_diagnostic_suggestions: [] as unknown[],
  };
}
