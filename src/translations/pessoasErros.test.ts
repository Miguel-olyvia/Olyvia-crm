import { describe, expect, it } from "vitest";
import { CHAVE_COMERCIAL_AMBIGUO, CHAVE_ERRO_GENERICO, CHAVES_ERRO_NEG } from "@/hooks/pessoas/errosNeg";
import { pessoasErrosTranslations } from "./pessoasErros";
import { pessoasPaginaTranslations } from "./pessoasPagina";

const { en, pt } = pessoasErrosTranslations;
const marcas = (texto: string): string[] => (texto.match(/\{\w+\}/g) ?? []).sort();

describe("traduções dos erros das funções neg_*", () => {
  it("pt e en têm exatamente as mesmas chaves, com os mesmos marcadores", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(pt).sort());
    for (const chave of Object.keys(pt)) expect(marcas(en[chave]), chave).toEqual(marcas(pt[chave]));
  });

  it("têm 28 mensagens por código, o comercial repetido e a genérica, com prefixo da página e sem texto vazio", () => {
    expect(Object.keys(pt)).toHaveLength(30);
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

  it("NG025 diz que já há uma proposta enviada ou aceite e que não se cria outra", () => {
    expect(pt["pessoasPagina.erroNeg.ng025"]).toBe("Este negócio já tem uma proposta enviada ou aceite: não se cria outra.");
    expect(en["pessoasPagina.erroNeg.ng025"]).toBe("This deal already has a sent or accepted proposal: another one cannot be created.");
  });

  it("NG027 diz que a pessoa da lead está fora do âmbito de quem classifica; o comercial repetido pede para distinguir", () => {
    expect(pt["pessoasPagina.erroNeg.ng027"]).toBe("Não tem permissão sobre a pessoa desta lead, por isso não a pode classificar.");
    expect(en["pessoasPagina.erroNeg.ng027"]).toBe("You do not have access to the person on this lead, so you cannot classify it.");
    expect(pt[CHAVE_COMERCIAL_AMBIGUO]).toMatch(/mesmo nome/);
    expect(en[CHAVE_COMERCIAL_AMBIGUO]).toMatch(/same name/);
  });

  it("NG028 diz que o negócio está fechado e que se reabre primeiro", () => {
    expect(pt["pessoasPagina.erroNeg.ng028"]).toBe(
      "Este negócio está fechado (ganho ou perdido): o título, as notas e o comercial já não se alteram. Reabra-o primeiro.",
    );
    expect(en["pessoasPagina.erroNeg.ng028"]).toBe(
      "This deal is closed (won or lost): its title, notes and sales rep can no longer be changed. Reopen it first.",
    );
  });

  it("a página junta estes textos nas duas línguas", () => {
    for (const chave of Object.keys(pt)) expect(pessoasPaginaTranslations.pt[chave]).toBe(pt[chave]);
    for (const chave of Object.keys(en)) expect(pessoasPaginaTranslations.en[chave]).toBe(en[chave]);
  });
});
