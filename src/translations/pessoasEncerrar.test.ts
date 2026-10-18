import { describe, expect, it } from "vitest";
import { MOTIVOS_PERDA } from "@/components/pessoas/opcoesPessoa";
import { RESULTADOS_ENCERRAMENTO } from "@/components/pessoas/acoesEncerrar";
import { pessoasEncerrarTranslations } from "./pessoasEncerrar";
import { pessoasPaginaTranslations } from "./pessoasPagina";

const { en, pt } = pessoasEncerrarTranslations;
const marcas = (texto: string): string[] => (texto.match(/\{\w+\}/g) ?? []).sort();

describe("traduções de encerrar a abordagem", () => {
  it("pt e en têm exatamente as mesmas chaves, com os mesmos marcadores", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(pt).sort());
    for (const chave of Object.keys(pt)) expect(marcas(en[chave]), chave).toEqual(marcas(pt[chave]));
  });

  it("todas as chaves levam o prefixo pessoasPagina.close. e nenhum texto está vazio", () => {
    for (const [chave, texto] of [...Object.entries(pt), ...Object.entries(en)]) {
      expect(chave).toMatch(/^pessoasPagina\.close\./);
      expect(texto.trim(), chave).not.toBe("");
    }
  });

  it("há um texto para cada resultado de encerramento e para 'Outro'", () => {
    for (const r of RESULTADOS_ENCERRAMENTO) expect(pt[`pessoasPagina.close.result.${r}`]).toBeTruthy();
    expect(pt["pessoasPagina.close.reason.other"]).toBeTruthy();
    expect(en["pessoasPagina.close.reason.other"]).toBeTruthy();
  });

  it("os 5 motivos da lista reutilizam os textos de perda, em pt e en", () => {
    for (const m of MOTIVOS_PERDA) {
      expect(pessoasPaginaTranslations.pt[`pessoasPagina.lost.${m}`]).toBeTruthy();
      expect(pessoasPaginaTranslations.en[`pessoasPagina.lost.${m}`]).toBeTruthy();
    }
  });

  it("a página junta os textos de encerrar nas duas línguas", () => {
    for (const chave of Object.keys(pt)) expect(pessoasPaginaTranslations.pt[chave]).toBe(pt[chave]);
    for (const chave of Object.keys(en)) expect(pessoasPaginaTranslations.en[chave]).toBe(en[chave]);
  });

  it("o resumo diz o resultado, o motivo e o dia", () => {
    expect(marcas(pt["pessoasPagina.close.summary"])).toEqual(["{date}", "{reason}", "{result}"]);
  });
});
