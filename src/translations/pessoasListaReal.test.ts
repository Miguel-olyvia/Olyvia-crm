import { describe, expect, it } from "vitest";
import { pessoasListaRealTranslations } from "./pessoasListaReal";
import { pessoasPaginaTranslations } from "./pessoasPagina";

const { en, pt } = pessoasListaRealTranslations;
const marcas = (texto: string): string[] => (texto.match(/\{\w+\}/g) ?? []).sort();

// Chaves que a Lista real vai usar (a parte B liga-as aos componentes).
const CHAVES_USADAS = [
  "title", "subtitle", "columns.person", "columns.stage", "columns.lastContact", "columns.nextVisit",
  "columns.value", "columns.deals", "noName", "searchHint", "loadMore", "loadingMore", "empty",
  "error", "retry", "readyToWin", "closed", "deals", "noContact", "noVisit",
  "stage.nova", "stage.emContacto", "stage.visitaMarcada", "stage.qualificada",
  "order.recentes", "order.nome", "closedResult.semInteresse", "closedResult.obraInviavel",
  "won.one", "won.other", "lost.one", "lost.other",
  "searchLabel", "searchPlaceholder", "orderLabel", "caption", "loading", "refreshWarn", "loadMoreError", "routeError",
  "regionLabel", "stageFilterLabel", "updating", "orderAnnounce", "emptyFiltered", "clearFilters", "deals.none",
].map((c) => `pessoasPagina.real.${c}`);

describe("traduções da Lista real das Pessoas", () => {
  it("pt e en têm as mesmas chaves, com os mesmos marcadores", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(pt).sort());
    for (const chave of Object.keys(pt)) expect(marcas(en[chave]), chave).toEqual(marcas(pt[chave]));
  });

  it("todas têm o prefixo certo e nenhuma está vazia", () => {
    expect(Object.keys(pt).length).toBeGreaterThan(0);
    for (const [chave, texto] of [...Object.entries(pt), ...Object.entries(en)]) {
      expect(chave).toMatch(/^pessoasPagina\.real\./);
      expect(texto.trim(), chave).not.toBe("");
    }
  });

  it("todas as chaves usadas existem em pt e en", () => {
    for (const chave of CHAVES_USADAS) {
      expect(pt[chave], chave).toBeTruthy();
      expect(en[chave], chave).toBeTruthy();
    }
  });

  it("os textos com contagens levam os marcadores esperados", () => {
    expect(marcas(pt["pessoasPagina.real.subtitle"])).toEqual(["{n}"]);
    expect(marcas(pt["pessoasPagina.real.closed"])).toEqual(["{result}"]);
    expect(marcas(pt["pessoasPagina.real.deals"])).toEqual(["{abertos}", "{ganhos}", "{perdidos}"]);
  });

  it("o plural leva {n} nas duas formas e a etapa cliente reutiliza a chave da lista", () => {
    for (const f of ["won", "lost"]) {
      for (const forma of ["one", "other"]) {
        expect(marcas(pt[`pessoasPagina.real.${f}.${forma}`])).toEqual(["{n}"]);
        expect(marcas(en[`pessoasPagina.real.${f}.${forma}`])).toEqual(["{n}"]);
      }
    }
    expect(pt["pessoasPagina.real.stage.cliente"]).toBeUndefined();
    expect(pessoasPaginaTranslations.pt["pessoasPagina.stage.cliente"]).toBeTruthy();
    expect(pessoasPaginaTranslations.en["pessoasPagina.stage.cliente"]).toBeTruthy();
  });

  it("a página junta estes textos nas duas línguas", () => {
    for (const chave of Object.keys(pt)) expect(pessoasPaginaTranslations.pt[chave]).toBe(pt[chave]);
    for (const chave of Object.keys(en)) expect(pessoasPaginaTranslations.en[chave]).toBe(en[chave]);
  });
});
