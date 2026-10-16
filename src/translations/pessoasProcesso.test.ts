import { describe, expect, it } from "vitest";
import { PASSOS_PROCESSO } from "@/components/pessoas/processo/passosProcesso";
import { pessoasPaginaTranslations } from "./pessoasPagina";
import { pessoasProcessoTranslations } from "./pessoasProcesso";

const { en, pt } = pessoasProcessoTranslations;
const marcas = (texto: string): string[] => (texto.match(/\{\w+\}/g) ?? []).sort();

describe("traduções do seletor de vista e do Quadro de Pessoas", () => {
  it("pt e en têm exatamente as mesmas chaves", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(pt).sort());
  });

  it("todas as chaves são view.*, board.*, deals.* ou todo.*, com o prefixo da página", () => {
    for (const chave of Object.keys(pt)) expect(chave).toMatch(/^pessoasPagina\.(view|board|deals|todo)\./);
  });

  it("há um texto de passo (todo.step.<id>) para cada um dos 14 passos do processo, e nenhum a mais", () => {
    const ids = Object.keys(pt).filter((c) => c.startsWith("pessoasPagina.todo.step.")).map((c) => c.slice("pessoasPagina.todo.step.".length));
    expect(ids.sort()).toEqual([...PASSOS_PROCESSO].sort());
  });

  it("os textos dos negócios da lista têm os marcadores certos", () => {
    expect(marcas(pt["pessoasPagina.deals.show"])).toEqual(["{count}"]);
    expect(marcas(pt["pessoasPagina.deals.for"])).toEqual(["{name}"]);
    expect(marcas(pt["pessoasPagina.deals.list"])).toEqual(["{name}"]);
    expect(marcas(pt["pessoasPagina.deals.summary.one"])).toEqual(["{step}"]);
    expect(marcas(pt["pessoasPagina.deals.summary.many"])).toEqual(["{count}", "{step}"]);
    expect(marcas(pt["pessoasPagina.deals.stepLabel"])).toEqual(["{name}", "{step}", "{work}"]);
  });

  it("os rótulos só para leitores de ecrã (fase, valor, prazo) existem nas duas línguas", () => {
    for (const chave of ["deals.sr.phase", "deals.sr.value", "deals.sr.deadline"]) {
      expect(pt[`pessoasPagina.${chave}`], chave).toMatch(/:$/);
      expect(en[`pessoasPagina.${chave}`], chave).toMatch(/:$/);
    }
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
