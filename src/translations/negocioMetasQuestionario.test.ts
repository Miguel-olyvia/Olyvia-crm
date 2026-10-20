// Os textos do formulário do levantamento lido da base (estado de carregamento, erros, números, aviso de questionário alterado): os mesmos
// em pt e en, registados com o prefixo de «Novo negócio», sem emoji.
import { describe, expect, it } from "vitest";
import { negocioMetasNovoTranslations } from "./negocioMetasNovo";
import { negocioMetasQuestionarioTranslations } from "./negocioMetasQuestionario";

const P = "businessGoals.new.";
const CHAVES = [
  "qform.loading", "qform.error", "qform.error.blocked", "qform.retry", "qform.notReady", "qform.changed", "qform.multi.hint", "qform.number.range", "qform.number.min", "qform.number.max",
  "qform.error.fora", "qform.error.casas", "qform.error.invalido", "qform.error.comprido", "qform.changedReloadFailed", "qform.error.ng008", "qform.error.permission",
  "qform.invalid", "qform.loaded", "qform.qualEmpty", "qform.visitEmpty",
];
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

describe("negocioMetasQuestionarioTranslations", () => {
  it.each(["pt", "en"] as const)("%s: tem todas as chaves, com o prefixo, e nenhuma vazia", (lingua) => {
    for (const chave of CHAVES) expect(negocioMetasQuestionarioTranslations[lingua][`${P}${chave}`], chave).toBeTruthy();
  });

  it("pt e en têm exatamente as mesmas chaves", () => {
    expect(Object.keys(negocioMetasQuestionarioTranslations.en).sort()).toEqual(Object.keys(negocioMetasQuestionarioTranslations.pt).sort());
  });

  it("estão registados nos textos de «Novo negócio» (o formulário de pessoas lê daí)", () => {
    for (const lingua of ["pt", "en"] as const) {
      for (const [chave, texto] of Object.entries(negocioMetasQuestionarioTranslations[lingua])) expect(negocioMetasNovoTranslations[lingua][chave], chave).toBe(texto);
    }
  });

  it("sem emoji e com os mesmos marcadores {n} nas duas línguas", () => {
    for (const lingua of ["pt", "en"] as const) {
      for (const texto of Object.values(negocioMetasQuestionarioTranslations[lingua])) expect(texto).not.toMatch(EMOJI);
    }
    for (const [chave, pt] of Object.entries(negocioMetasQuestionarioTranslations.pt)) {
      const marcadores = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
      expect(marcadores(negocioMetasQuestionarioTranslations.en[chave]), chave).toBe(marcadores(pt));
    }
  });

  it("os limites dizem-se com os valores ({min} e {max})", () => {
    expect(negocioMetasQuestionarioTranslations.pt[`${P}qform.number.range`]).toMatch(/\{min\}.*\{max\}/);
  });
});
