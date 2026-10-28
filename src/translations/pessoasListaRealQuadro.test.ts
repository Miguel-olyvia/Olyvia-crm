import { describe, expect, it } from "vitest";
import { pessoasListaRealTranslations } from "./pessoasListaReal";
import { pessoasPaginaTranslations } from "./pessoasPagina";

const { en, pt } = pessoasListaRealTranslations;
const marcas = (texto: string): string[] => (texto.match(/\{\w+\}/g) ?? []).sort();

const MARCADORES: Record<string, string[]> = {
  colNew: [], subtitle: ["{n}"], loading: [], updating: [], error: [], refreshWarn: [], emptyAll: [], emptyFiltered: [],
  showing: ["{shown}", "{total}"], loadMore: ["{n}"], loadMoreLabel: ["{column}", "{n}"], loadingMore: ["{column}"],
  loadedMore: ["{column}", "{n}", "{shown}", "{total}"], loadMoreError: [], retry: [], stalled: ["{n}"],
  // (Financeiro e Obra lêem de neg_ler_negocios: já não há «indisponível» nem os textos fixos do passo, que vêm do motor da Emylia)
  "pos.loading": [], "pos.error": [],
};

describe("traduções do Quadro real das Pessoas", () => {
  it.each(Object.entries(MARCADORES))("pessoasPagina.real.board.%s existe em pt e en, não está vazia e leva os mesmos marcadores", (chave, esperados) => {
    const k = `pessoasPagina.real.board.${chave}`;
    expect(pt[k]?.trim(), k).toBeTruthy();
    expect(en[k]?.trim(), k).toBeTruthy();
    expect(marcas(pt[k]), k).toEqual(esperados);
    expect(marcas(en[k]), k).toEqual(esperados);
  });

  it("a coluna «Novo» chama-se Novo em português e New em inglês", () => {
    expect(pt["pessoasPagina.real.board.colNew"]).toBe("Novo");
    expect(en["pessoasPagina.real.board.colNew"]).toBe("New");
  });

  it("as colunas Financeiro e Obra têm título nas duas línguas e chegam à página", () => {
    for (const k of ["pessoasPagina.board.col.financeiro", "pessoasPagina.board.col.obra"]) {
      expect(pt[k]?.trim(), k).toBeTruthy();
      expect(en[k]?.trim(), k).toBeTruthy();
      expect(pessoasPaginaTranslations.pt[k]).toBe(pt[k]);
      expect(pessoasPaginaTranslations.en[k]).toBe(en[k]);
    }
    expect(pt["pessoasPagina.board.col.financeiro"]).toBe("Financeiro");
    expect(pt["pessoasPagina.board.col.obra"]).toBe("Obra");
  });

  it("chegam à página nas duas línguas", () => {
    for (const chave of Object.keys(MARCADORES)) {
      const k = `pessoasPagina.real.board.${chave}`;
      expect(pessoasPaginaTranslations.pt[k]).toBe(pt[k]);
      expect(pessoasPaginaTranslations.en[k]).toBe(en[k]);
    }
  });
});
