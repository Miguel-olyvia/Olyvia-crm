import { describe, expect, it } from "vitest";
import { CHAVES_ERRO_NEG } from "@/hooks/pessoas/errosNeg";
import { pessoasFichaRealTranslations } from "./pessoasFichaReal";
import { pessoasPaginaTranslations } from "./pessoasPagina";

const { en, pt } = pessoasFichaRealTranslations;
const marcas = (texto: string): string[] => (texto.match(/\{\w+\}/g) ?? []).sort();

// As chaves que o código da ficha real usa (FichaReal, useAcoesFichaReal e adaptarAtividade).
const CHAVES_USADAS = [
  "opening", "notFound", "partialCall", "partialVisit", "saving", "staleWarn", "unknownResult",
  "more.contactos", "more.visitas", "more.levantamentos", "more.atividade", "more.loading",
  "activity.snoozed", "activity.lost", "activity.reopened", "activity.won", "activity.deleted", "activity.restored",
].map((c) => `pessoasPagina.real.ficha.${c}`);

describe("traduções da ficha real das Pessoas", () => {
  it("pt e en têm as mesmas chaves, com os mesmos marcadores", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(pt).sort());
    for (const chave of Object.keys(pt)) expect(marcas(en[chave]), chave).toEqual(marcas(pt[chave]));
  });

  it("todas têm o prefixo certo e nenhuma está vazia", () => {
    expect(Object.keys(pt).length).toBeGreaterThan(0);
    for (const [chave, texto] of [...Object.entries(pt), ...Object.entries(en)]) {
      expect(chave).toMatch(/^pessoasPagina\.real\.ficha\./);
      expect(texto.trim(), chave).not.toBe("");
    }
  });

  it("todas as chaves usadas existem em pt e en", () => {
    for (const chave of CHAVES_USADAS) {
      expect(pt[chave], chave).toBeTruthy();
      expect(en[chave], chave).toBeTruthy();
    }
  });

  it("o aviso de falha parcial diz as duas coisas: o contacto ficou e o encerramento não", () => {
    expect(pt["pessoasPagina.real.ficha.partialCall"]).toMatch(/contacto/i);
    expect(pt["pessoasPagina.real.ficha.partialCall"]).toMatch(/encerr/i);
    expect(en["pessoasPagina.real.ficha.partialCall"]).toMatch(/call|contact/i);
    expect(en["pessoasPagina.real.ficha.partialCall"]).toMatch(/clos/i);
  });

  it("o aviso de falha parcial da visita diz que a abordagem ficou encerrada e o resultado não", () => {
    expect(pt["pessoasPagina.real.ficha.partialVisit"]).toMatch(/encerrada/i);
    expect(pt["pessoasPagina.real.ficha.partialVisit"]).toMatch(/resultado/i);
    expect(en["pessoasPagina.real.ficha.partialVisit"]).toMatch(/closed/i);
    expect(en["pessoasPagina.real.ficha.partialVisit"]).toMatch(/result/i);
  });

  it("«A guardar…» e «A carregar…» existem com o acento e a reticência certos", () => {
    expect(pt["pessoasPagina.real.ficha.saving"]).toBe("A guardar…");
    expect(en["pessoasPagina.real.ficha.saving"]).toBe("Saving…");
    expect(pt["pessoasPagina.real.ficha.more.loading"]).toBe("A carregar…");
    expect(en["pessoasPagina.real.ficha.more.loading"]).toBe("Loading…");
  });

  it("cada «carregar mais» diz de que secção fala", () => {
    expect(pt["pessoasPagina.real.ficha.more.contactos"]).toBe("Carregar mais contactos");
    expect(pt["pessoasPagina.real.ficha.more.levantamentos"]).toBe("Carregar mais levantamentos");
    expect(en["pessoasPagina.real.ficha.more.atividade"]).toBe("Load more activity");
    expect(en["pessoasPagina.real.ficha.more.visitas"]).toBe("Load more visits");
  });

  it("a página junta estes textos nas duas línguas", () => {
    for (const chave of Object.keys(pt)) expect(pessoasPaginaTranslations.pt[chave]).toBe(pt[chave]);
    for (const chave of Object.keys(en)) expect(pessoasPaginaTranslations.en[chave]).toBe(en[chave]);
  });

  it("as chaves que o código já usa e reaproveita existem na página em pt e en", () => {
    const reaproveitadas = [
      "pessoasPagina.activity.noteAdded", "pessoasPagina.close.activity.closed", "pessoasPagina.close.activity.reopened",
      "pessoasPagina.real.noContact", "pessoasPagina.erroNeg.generico", ...Object.values(CHAVES_ERRO_NEG),
    ];
    for (const chave of reaproveitadas) {
      expect(pessoasPaginaTranslations.pt[chave], chave).toBeTruthy();
      expect(pessoasPaginaTranslations.en[chave], chave).toBeTruthy();
    }
  });
});
