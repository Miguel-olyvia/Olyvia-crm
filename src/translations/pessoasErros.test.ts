import { describe, expect, it } from "vitest";
import { CHAVE_ERRO_GENERICO, CHAVES_ERRO_NEG } from "@/hooks/pessoas/errosNeg";
import { pessoasErrosTranslations } from "./pessoasErros";
import { pessoasPaginaTranslations } from "./pessoasPagina";

const { en, pt } = pessoasErrosTranslations;
const marcas = (texto: string): string[] => (texto.match(/\{\w+\}/g) ?? []).sort();

describe("traduções dos erros das funções neg_*", () => {
  it("pt e en têm exatamente as mesmas chaves, com os mesmos marcadores", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(pt).sort());
    for (const chave of Object.keys(pt)) expect(marcas(en[chave]), chave).toEqual(marcas(pt[chave]));
  });

  it("têm 22 mensagens mais a genérica, com prefixo da página e sem texto vazio", () => {
    expect(Object.keys(pt)).toHaveLength(23);
    for (const [chave, texto] of [...Object.entries(pt), ...Object.entries(en)]) {
      expect(chave).toMatch(/^pessoasPagina\.erroNeg\./);
      expect(texto.trim(), chave).not.toBe("");
    }
  });

  it("todas as chaves usadas por errosNeg existem em pt e en", () => {
    for (const chave of [...Object.values(CHAVES_ERRO_NEG), CHAVE_ERRO_GENERICO]) {
      expect(pt[chave], chave).toBeTruthy();
      expect(en[chave], chave).toBeTruthy();
    }
  });

  it("a página junta estes textos nas duas línguas", () => {
    for (const chave of Object.keys(pt)) expect(pessoasPaginaTranslations.pt[chave]).toBe(pt[chave]);
    for (const chave of Object.keys(en)) expect(pessoasPaginaTranslations.en[chave]).toBe(en[chave]);
  });
});
