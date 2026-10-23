// Como o editor de orçamentos grava: sem negócio (ou ao editar um orçamento que já existe) por rpc_save_quote, como sempre; a criar a partir de um
// negócio, com a bandeira do fecho ligada, por neg_criar_orcamento (o orçamento nasce já ligado ao negócio), com os mesmos dados mais o negócio.
import { describe, expect, it } from "vitest";
import { escolherGravacaoDeOrcamento, parametrosNegCriarOrcamento } from "./criarOrcamentoNoNegocio";

const DADOS = {
  quoteData: { organization_id: "org", entity_id: "e1", titulo: "X" }, lines: [{ ordem: 1 }], fees: [], totals: { subtotal: 1, total_fees: 0, total: 1 },
};

describe("escolherGravacaoDeOrcamento", () => {
  it("sem negócio grava por rpc_save_quote, como sempre", () => {
    expect(escolherGravacaoDeOrcamento({ quoteId: null })).toBe("rpc_save_quote");
    expect(escolherGravacaoDeOrcamento({ quoteId: null, criarNoNegocioId: undefined })).toBe("rpc_save_quote");
    expect(escolherGravacaoDeOrcamento({ quoteId: null, criarNoNegocioId: "" })).toBe("rpc_save_quote");
  });

  it("a criar a partir de um negócio grava por neg_criar_orcamento", () => {
    expect(escolherGravacaoDeOrcamento({ quoteId: null, criarNoNegocioId: "neg-1" })).toBe("neg_criar_orcamento");
  });

  it("ao editar um orçamento que já existe grava por rpc_save_quote, mesmo com negócio", () => {
    expect(escolherGravacaoDeOrcamento({ quoteId: "q1", criarNoNegocioId: "neg-1" })).toBe("rpc_save_quote");
  });
});

describe("parametrosNegCriarOrcamento", () => {
  it("leva o negócio e os mesmos dados do orçamento, e nada mais (sem p_quote_id)", () => {
    const p = parametrosNegCriarOrcamento("neg-1", DADOS);
    expect(p).toEqual({
      p_negocio_id: "neg-1", p_quote_data: DADOS.quoteData, p_lines: DADOS.lines, p_fees: DADOS.fees, p_totals: DADOS.totals,
      p_inline_quotes: [], p_diagnostic_suggestions: [],
    });
    expect(p).not.toHaveProperty("p_quote_id");
  });
});
