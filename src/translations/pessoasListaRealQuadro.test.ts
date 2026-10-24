import { describe, expect, it } from "vitest";
import { pessoasListaRealTranslations } from "./pessoasListaReal";
import { pessoasPaginaTranslations } from "./pessoasPagina";

const { en, pt } = pessoasListaRealTranslations;
const marcas = (texto: string): string[] => (texto.match(/\{\w+\}/g) ?? []).sort();

const MARCADORES: Record<string, string[]> = {
  colNew: [], subtitle: ["{n}"], loading: [], updating: [], error: [], refreshWarn: [], emptyAll: [], emptyFiltered: [],
  showing: ["{shown}", "{total}"], loadMore: ["{n}"], loadMoreLabel: ["{column}", "{n}"], loadingMore: ["{column}"],
  loadedMore: ["{column}", "{n}", "{shown}", "{total}"], loadMoreError: [], retry: [], stalled: ["{n}"],
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

  it("chegam à página nas duas línguas", () => {
    for (const chave of Object.keys(MARCADORES)) {
      const k = `pessoasPagina.real.board.${chave}`;
      expect(pessoasPaginaTranslations.pt[k]).toBe(pt[k]);
      expect(pessoasPaginaTranslations.en[k]).toBe(en[k]);
    }
  });
});
