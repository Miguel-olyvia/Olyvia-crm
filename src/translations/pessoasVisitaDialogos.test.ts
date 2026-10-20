import { describe, expect, it } from "vitest";
import { pessoasPaginaTranslations } from "./pessoasPagina";
import { pessoasVisitaDialogosTranslations } from "./pessoasVisitaDialogos";

const { en, pt } = pessoasVisitaDialogosTranslations;
const marcas = (texto: string): string[] => (texto.match(/\{\w+\}/g) ?? []).sort();
// Emojis e pictogramas: a interface não leva nenhum.
const EMOJI = /\p{Extended_Pictographic}/u;

describe("traduções dos diálogos de visita (agenda, alterar, cancelar)", () => {
  it("pt e en têm exatamente as mesmas chaves, com os mesmos marcadores", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(pt).sort());
    for (const chave of Object.keys(pt)) expect(marcas(en[chave]), chave).toEqual(marcas(pt[chave]));
  });

  it("nenhum texto está vazio, nenhum leva emoji e todas as chaves são da visita real", () => {
    for (const [chave, texto] of [...Object.entries(pt), ...Object.entries(en)]) {
      expect(chave).toMatch(/^pessoasPagina\.real\.visit\./);
      expect(texto.trim(), chave).not.toBe("");
      expect(texto, chave).not.toMatch(EMOJI);
    }
  });

  it("têm os textos de que os diálogos precisam", () => {
    const precisas = [
      "agenda.board", "agenda.boardChoose", "agenda.loading", "agenda.date", "agenda.time", "agenda.boardNone", "agenda.loadError", "agenda.formLoadError", "agenda.retry", "agenda.resources", "agenda.resourcesNone",
      "agenda.resourceBusy", "agenda.duration", "agenda.duration.m30", "agenda.duration.h1", "agenda.duration.h1m30", "agenda.duration.h2",
      "agenda.duration.custom", "agenda.error.horaVazia", "conflict.busy", "conflict.failed", "conflict.failedFor", "conflict.checking",
      "marcar.done", "marcar.description", "alterar.description", "alterar.done", "alterar.owner", "alterar.ownerUnknown", "alterar.ownerOthers", "alterar.unconfirmed",
      "cancelar.button", "cancelar.buttonLabel", "cancelar.title", "cancelar.description", "cancelar.confirm", "cancelar.back", "cancelar.done",
      "kind.levantamento", "kind.medicao", "kind.materiais", "kind.revisita",
    ];
    for (const sufixo of precisas) {
      expect(pt[`pessoasPagina.real.visit.${sufixo}`], sufixo).toBeTruthy();
      expect(en[`pessoasPagina.real.visit.${sufixo}`], sufixo).toBeTruthy();
    }
  });

  it("os avisos de dono e de conflito levam os marcadores que o código preenche", () => {
    expect(marcas(pt["pessoasPagina.real.visit.alterar.owner"])).toEqual(["{name}", "{owner}"]);
    expect(marcas(pt["pessoasPagina.real.visit.alterar.ownerOthers"])).toEqual(["{count}"]);
    expect(marcas(pt["pessoasPagina.real.visit.conflict.busy"])).toEqual(["{names}"]);
    expect(marcas(pt["pessoasPagina.real.visit.conflict.failedFor"])).toEqual(["{names}"]);
    expect(marcas(pt["pessoasPagina.real.visit.agenda.duration.custom"])).toEqual(["{minutes}"]);
  });

  it("a página junta estes textos nas duas línguas", () => {
    for (const chave of Object.keys(pt)) expect(pessoasPaginaTranslations.pt[chave]).toBe(pt[chave]);
    for (const chave of Object.keys(en)) expect(pessoasPaginaTranslations.en[chave]).toBe(en[chave]);
  });
});
