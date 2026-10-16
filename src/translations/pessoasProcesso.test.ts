import { describe, expect, it } from "vitest";
import { pessoasPaginaTranslations } from "./pessoasPagina";
import { pessoasProcessoTranslations } from "./pessoasProcesso";

const { en, pt } = pessoasProcessoTranslations;
const marcas = (texto: string): string[] => (texto.match(/\{\w+\}/g) ?? []).sort();

describe("traduções do seletor de vista e do Quadro de Pessoas", () => {
  it("pt e en têm exatamente as mesmas chaves", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(pt).sort());
  });

  it("todas as chaves são view.* ou board.*, com o prefixo da página", () => {
    for (const chave of Object.keys(pt)) expect(chave).toMatch(/^pessoasPagina\.(view|board)\./);
  });

  it("nenhum texto está vazio e os marcadores {x} coincidem entre línguas", () => {
    for (const chave of Object.keys(pt)) {
      expect(pt[chave].trim(), chave).not.toBe("");
      expect(en[chave].trim(), chave).not.toBe("");
      expect(marcas(en[chave]), chave).toEqual(marcas(pt[chave]));
    }
  });

  it("estão registadas em pessoasPagina, nas duas línguas", () => {
    for (const lingua of ["en", "pt"] as const) {
      for (const [chave, texto] of Object.entries(pessoasProcessoTranslations[lingua])) {
        expect(pessoasPaginaTranslations[lingua][chave], chave).toBe(texto);
      }
    }
  });

  it("têm o anúncio de vista, o separador da contagem e a frase das perdidas", () => {
    for (const chave of [
      "view.announce.list", "view.announce.board", "board.count.sep", "board.lostHint",
    ]) {
      expect(pt[`pessoasPagina.${chave}`], chave).toBeTruthy();
      expect(en[`pessoasPagina.${chave}`], chave).toBeTruthy();
    }
    expect(pt["pessoasPagina.view.announce.board"]).toContain("{count}");
  });

  it("há uma coluna traduzida para cada uma das 6 fases", () => {
    for (const fase of ["porContactar", "contactado", "visita", "orcamento", "proposta", "contrato"]) {
      expect(pt[`pessoasPagina.board.col.${fase}`]).toBeTruthy();
      expect(en[`pessoasPagina.board.col.${fase}`]).toBeTruthy();
    }
  });
});
