// Os textos do tipo de fecho do negócio (pessoasFecho.ts): pt e en com as mesmas chaves e marcadores, nenhum vazio, sem emoji, todas as chaves
// que o código usa existem nas duas línguas e chegam à página (pessoasPagina junta-as).
import { describe, expect, it } from "vitest";
import { pessoasFechoTranslations } from "./pessoasFecho";
import { pessoasPaginaTranslations } from "./pessoasPagina";

const { en, pt } = pessoasFechoTranslations;
const marcas = (texto: string): string[] => (texto.match(/\{\w+\}/g) ?? []).sort();
const N = "pessoasPagina.neg.fecho.";
const EMOJI = /\p{Extended_Pictographic}/u;

const CHAVES_USADAS = [
  "question", "hint", "option.contrato", "option.proposta", "tag.contrato", "tag.proposta", "note.proposta",
  "change.button", "change.title", "change.description", "change.to.proposta", "change.to.contrato", "change.cancel",
  "confirm.proposta", "confirm.contrato", "confirm.button", "done.proposta", "done.contrato", "unchanged",
].map((c) => `${N}${c}`);

describe("traduções do tipo de fecho", () => {
  it("pt e en têm as mesmas chaves, com os mesmos marcadores", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(pt).sort());
    for (const chave of Object.keys(pt)) expect(marcas(en[chave]), chave).toEqual(marcas(pt[chave]));
  });

  it("todas têm o prefixo certo, nenhuma está vazia e nenhuma leva emoji", () => {
    for (const [chave, texto] of [...Object.entries(pt), ...Object.entries(en)]) {
      expect(chave.startsWith(N), chave).toBe(true);
      expect(texto.trim(), chave).not.toBe("");
      expect(EMOJI.test(texto), chave).toBe(false);
    }
  });

  it("as chaves que o código usa existem nas duas línguas", () => {
    for (const chave of CHAVES_USADAS) {
      expect(pt[chave], chave).toBeTruthy();
      expect(en[chave], chave).toBeTruthy();
    }
  });

  it("as duas opções do formulário têm os rótulos acordados", () => {
    expect(pt[`${N}question`]).toBe("Como fecha este negócio?");
    expect(pt[`${N}option.contrato`]).toBe("No contrato");
    expect(pt[`${N}option.proposta`]).toBe("Na proposta (venda directa)");
  });

  it("a página junta estes textos nas duas línguas", () => {
    for (const chave of Object.keys(pt)) expect(pessoasPaginaTranslations.pt[chave]).toBe(pt[chave]);
    for (const chave of Object.keys(en)) expect(pessoasPaginaTranslations.en[chave]).toBe(en[chave]);
  });
});
