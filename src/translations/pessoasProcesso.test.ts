import { describe, expect, it } from "vitest";
import { PASSOS_PROCESSO } from "@/components/pessoas/processo/tiposProcesso";
import type { FaltaProcesso } from "@/components/pessoas/processo/portoesProcesso";
import { pessoasAcoesTranslations } from "./pessoasAcoes";
import { pessoasChamadaTranslations } from "./pessoasChamada";
import { pessoasFichaTranslations } from "./pessoasFicha";
import { pessoasFichaResumoTranslations } from "./pessoasFichaResumo";
import { pessoasListaTranslations } from "./pessoasLista";
import { pessoasPaginaTranslations } from "./pessoasPagina";
import { pessoasProcessoTranslations } from "./pessoasProcesso";
import { pessoasVisitaTranslations } from "./pessoasVisita";

const { en, pt } = pessoasProcessoTranslations;
/** Tudo o que um portão pode dizer que falta (ver `portoesProcesso.ts`); o `Record` obriga a não esquecer nenhum. */
const FALTAS = Object.keys({
  dataVisita: 0, visita: 0, visitaFeita: 0, linhas: 0, linhaInvalida: 0, pessoa: 0,
} satisfies Record<FaltaProcesso, 0>);
const marcas = (texto: string): string[] => (texto.match(/\{\w+\}/g) ?? []).sort();

describe("traduções do seletor de vista e do Quadro de Pessoas", () => {
  it("pt e en têm exatamente as mesmas chaves", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(pt).sort());
  });

  it("todas as chaves são view.*, board.*, deals.*, todo.*, process.*, gate.* ou done.*, com o prefixo da página", () => {
    for (const chave of Object.keys(pt)) expect(chave).toMatch(/^pessoasPagina\.(view|board|deals|todo|process|gate|done)\./);
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

  it("o botão do passo no Quadro diz o mesmo que o da Lista: '{passo}: {trabalho} de {nome}', e '(abre a ficha)' só onde ainda não executa", () => {
    for (const lingua of [pt, en]) {
      expect(marcas(lingua["pessoasPagina.board.step"])).toEqual(["{name}", "{step}", "{work}"]);
      expect(marcas(lingua["pessoasPagina.board.stepOpens"])).toEqual(["{name}", "{step}", "{work}"]);
    }
    expect(pt["pessoasPagina.board.step"]).toBe(pt["pessoasPagina.process.stepLabel"]);
    expect(pt["pessoasPagina.board.stepOpens"]).toBe(pt["pessoasPagina.deals.stepLabel"]);
    expect(en["pessoasPagina.board.step"]).toBe(en["pessoasPagina.process.stepLabel"]);
    expect(en["pessoasPagina.board.stepOpens"]).toBe(en["pessoasPagina.deals.stepLabel"]);
  });

  it("o painel aberto por um passo tem título e descrição próprios, com o nome da pessoa, nas duas línguas", () => {
    for (const chave of ["process.survey.title", "process.survey.description", "process.deal.title", "process.deal.description"]) {
      expect(pt[`pessoasPagina.${chave}`], chave).toBeTruthy();
      expect(en[`pessoasPagina.${chave}`], chave).toBeTruthy();
    }
    expect(marcas(pt["pessoasPagina.process.survey.title"])).toEqual(["{name}"]);
    expect(marcas(pt["pessoasPagina.process.deal.title"])).toEqual(["{name}"]);
    expect(pt["pessoasPagina.process.survey.title"]).toBe("Levantamento de {name}");
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

  it("há um texto de portão (gate.<falta>) para cada coisa que pode faltar, nas duas línguas", () => {
    for (const falta of FALTAS) {
      expect(pt[`pessoasPagina.gate.${falta}`], falta).toBeTruthy();
      expect(en[`pessoasPagina.gate.${falta}`], falta).toBeTruthy();
    }
    const gates = Object.keys(pt).filter((c) => c.startsWith("pessoasPagina.gate.") && c !== "pessoasPagina.gate.blocked");
    expect(gates.map((c) => c.slice("pessoasPagina.gate.".length)).sort()).toEqual([...FALTAS].sort());
    expect(marcas(pt["pessoasPagina.gate.blocked"])).toEqual(["{reasons}", "{step}"]);
  });

  it("os avisos do que aconteceu (done.*) têm os marcadores certos", () => {
    expect(marcas(pt["pessoasPagina.done.call"])).toEqual(["{name}", "{phase}"]);
    expect(marcas(pt["pessoasPagina.done.callStays"])).toEqual(["{name}", "{phase}"]);
    expect(marcas(pt["pessoasPagina.done.callNoPhase"])).toEqual(["{name}"]);
    expect(marcas(pt["pessoasPagina.done.visitBooked"])).toEqual(["{name}", "{phase}"]);
    expect(marcas(pt["pessoasPagina.done.visitDone"])).toEqual(["{name}", "{phase}", "{step}"]);
    expect(marcas(pt["pessoasPagina.done.survey"])).toEqual(["{name}", "{step}"]);
    expect(marcas(pt["pessoasPagina.done.deal"])).toEqual(["{name}", "{phase}"]);
  });

  it("o diálogo 'A visita já foi feita?' e a nota de 200 caracteres", () => {
    expect(pt["pessoasPagina.process.visitDone.title"]).toBe("A visita já foi feita?");
    expect(marcas(pt["pessoasPagina.process.visitDone.noteError"])).toEqual(["{max}"]);
    expect(marcas(pt["pessoasPagina.process.visitDone.count"])).toEqual(["{count}", "{max}"]);
    expect(marcas(pt["pessoasPagina.process.stepLabel"])).toEqual(["{name}", "{step}", "{work}"]);
  });

  it("as chaves novas (process, gate, done) não colidem com as de outros módulos de Pessoas", () => {
    const modulos = [
      pessoasAcoesTranslations, pessoasChamadaTranslations, pessoasFichaTranslations, pessoasFichaResumoTranslations,
      pessoasListaTranslations, pessoasVisitaTranslations,
    ];
    for (const lingua of ["en", "pt"] as const) {
      for (const chave of Object.keys(pessoasProcessoTranslations[lingua])) {
        for (const modulo of modulos) expect(chave in modulo[lingua], chave).toBe(false);
      }
    }
  });

  it("há uma coluna traduzida para cada uma das 6 fases", () => {
    for (const fase of ["porContactar", "contactado", "visita", "orcamento", "proposta", "contrato"]) {
      expect(pt[`pessoasPagina.board.col.${fase}`]).toBeTruthy();
      expect(en[`pessoasPagina.board.col.${fase}`]).toBeTruthy();
    }
  });
});
