// Os textos de gravar o painel «Visita e levantamento» na ficha real: pt e en com as mesmas chaves e marcadores, sem emojis, e juntos na página.
import { describe, expect, it } from "vitest";
import { pessoasPaginaTranslations } from "./pessoasPagina";
import { pessoasRegistosGravarTranslations } from "./pessoasRegistosGravar";

const { en, pt } = pessoasRegistosGravarTranslations;
const marcas = (texto: string): string[] => (texto.match(/\{\w+\}/g) ?? []).sort();
const EMOJI = /\p{Extended_Pictographic}/u;
const PARTES = ["criarVisita", "alterarVisita", "concluirVisita", "cancelarVisita", "levantamento"];
const FALTAS = ["dateMissing", "timeMissing", "doneInFuture", "noAgenda"];

describe("traduções de gravar visitas e levantamento", () => {
  it("pt e en têm as mesmas chaves, com os mesmos marcadores", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(pt).sort());
    for (const chave of Object.keys(pt)) expect(marcas(en[chave]), chave).toEqual(marcas(pt[chave]));
  });

  it("todas levam o prefixo dos registos, nenhuma está vazia e não há emojis", () => {
    for (const [chave, texto] of [...Object.entries(pt), ...Object.entries(en)]) {
      expect(chave).toMatch(/^pessoasPagina\.real\.records\./);
      expect(texto.trim(), chave).not.toBe("");
      expect(texto, chave).not.toMatch(EMOJI);
    }
  });

  it("tem o aviso de parcial (com e sem detalhe), cada parte que se grava, e cada recusa antes de escrever", () => {
    const P = "pessoasPagina.real.records.";
    for (const chave of [`${P}partial`, `${P}partialDetail`, `${P}saved`, `${P}nothing`, ...PARTES.map((p) => `${P}part.${p}`), ...FALTAS.map((f) => `${P}err.${f}`)]) {
      expect(pt[chave], chave).toBeTruthy();
      expect(en[chave], chave).toBeTruthy();
    }
    expect(marcas(pt[`${P}partialDetail`])).toEqual(["{done}", "{failed}"]);
    expect(marcas(pt[`${P}saved`])).toEqual(["{name}"]);
  });

  it("o aviso de parcial diz que o que falhou se repete e o que ficou não", () => {
    expect(pt["pessoasPagina.real.records.partialDetail"]).toMatch(/ficou gravado/i);
    expect(pt["pessoasPagina.real.records.partialDetail"]).toMatch(/só o que falta/i);
  });

  it("a recusa por falta de agenda remete para «Marcar visita» (que deixa escolher o quadro e quem vai)", () => {
    expect(pt["pessoasPagina.real.records.err.noAgenda"]).toMatch(/Marcar visita/);
    expect(en["pessoasPagina.real.records.err.noAgenda"]).toMatch(/Book visit/);
  });

  it("a página junta estes textos nas duas línguas", () => {
    for (const chave of Object.keys(pt)) expect(pessoasPaginaTranslations.pt[chave]).toBe(pt[chave]);
    for (const chave of Object.keys(en)) expect(pessoasPaginaTranslations.en[chave]).toBe(en[chave]);
  });
});
