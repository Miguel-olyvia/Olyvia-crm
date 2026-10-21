// Os textos do negócio na ficha real (pessoasNegocio.ts): pt e en com as mesmas chaves e os mesmos marcadores, nenhum vazio, e todas as chaves
// que o código usa existem nas duas línguas e chegam ao `useTranslation` (juntam-se a `pessoasPagina`).
import { describe, expect, it } from "vitest";
import { pessoasNegocioTranslations } from "./pessoasNegocio";
import { pessoasPaginaTranslations } from "./pessoasPagina";

const { en, pt } = pessoasNegocioTranslations;
const marcas = (texto: string): string[] => (texto.match(/\{\w+\}/g) ?? []).sort();
const N = "pessoasPagina.neg.";

// As chaves que o código usa (diretas ou montadas por um sufixo).
const CHAVES_USADAS = [
  "saving",
  "undo.title", "undo.description", "undo.reason", "undo.error.empty", "undo.error.tooLong", "undo.confirm", "undo.cancel", "undo.done",
  "win.button", "win.title", "win.description", "win.lead", "win.confirm", "win.cancel", "win.ng006.proposal", "win.otherLeads.one", "win.otherLeads.many",
  "win.done.feita", "win.done.ja_cliente", "win.done.ja_convertida", "win.done.generic", "win.done.already",
  "win.blocked.naoAberto", "win.blocked.semProposta", "win.blocked.semContrato", "win.blocked.semRegra",
  "lead.option", "lead.option.closed",
  "link.surveyLocked",
  "create.description", "create.name", "create.name.hint", "create.name.error", "create.notes", "create.lead", "create.reopen", "create.reopen.hint",
  "create.reopen.error","create.records.noPermission", "create.cancel", "create.submit", "create.done",
  "create.refused.one", "create.refused.many",
  "create.partial", "create.partial.closed", "create.closeCreated", "create.tab.visit", "create.tab.visit.count", "create.tab.visit.count.one", "create.tab.survey",
  "create.calls.title", "create.calls.hint", "create.visits.link.title", "create.visits.link.hint", "create.visits.link.none", "create.visits.new.title",
  "create.survey.title",
  "process.quote.title", "process.quote.linked", "process.quote.notLinked", "process.proposal.linked", "process.proposal.notLinked",
  "process.contract.linked", "process.contract.notLinked", "process.quotes.preset.error", "contract.presetMissing", "process.open.orcamento", "process.open.proposta", "process.open.contrato",
  "back.label", "back.link",
].map((c) => `${N}${c}`);

describe("traduções do negócio na ficha real", () => {
  it("pt e en têm as mesmas chaves, com os mesmos marcadores", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(pt).sort());
    for (const chave of Object.keys(pt)) expect(marcas(en[chave]), chave).toEqual(marcas(pt[chave]));
  });

  it("todas têm o prefixo certo e nenhuma está vazia", () => {
    expect(Object.keys(pt).length).toBeGreaterThan(50);
    for (const [chave, texto] of [...Object.entries(pt), ...Object.entries(en)]) {
      expect(chave.startsWith(N), chave).toBe(true);
      expect(texto.trim(), chave).not.toBe("");
    }
  });

  it("todas as chaves usadas existem em pt e en, e não há chaves a mais", () => {
    for (const chave of CHAVES_USADAS) {
      expect(pt[chave], chave).toBeTruthy();
      expect(en[chave], chave).toBeTruthy();
    }
    expect(Object.keys(pt).sort()).toEqual([...CHAVES_USADAS].sort());
  });

  it("chegam à página (pessoasPagina junta-as) nas duas línguas", () => {
    for (const chave of Object.keys(pt)) {
      expect(pessoasPaginaTranslations.pt[chave], chave).toBe(pt[chave]);
      expect(pessoasPaginaTranslations.en[chave], chave).toBe(en[chave]);
    }
  });

  it("os textos com marcadores têm os marcadores certos", () => {
    expect(marcas(pt[`${N}undo.description`])).toEqual(["{name}", "{work}"]);
    expect(marcas(pt[`${N}undo.done`])).toEqual(["{name}", "{work}"]);
    expect(marcas(pt[`${N}win.description`])).toEqual(["{name}", "{work}"]);
    expect(marcas(pt[`${N}win.otherLeads.many`])).toEqual(["{count}"]);
    expect(marcas(pt[`${N}lead.option`])).toEqual(["{date}"]);
    expect(marcas(pt[`${N}create.done`])).toEqual(["{name}", "{title}"]);
    expect(marcas(pt[`${N}create.refused.many`])).toEqual(["{count}"]);
    expect(marcas(pt[`${N}create.tab.visit.count`])).toEqual(["{n}"]);
    expect(marcas(pt[`${N}process.quote.title`])).toEqual(["{name}"]);
  });

  it("as mensagens de «não ficou ligado» terminam com ponto: a causa traduzida segue-se-lhes na mesma frase", () => {
    for (const chave of ["quote", "proposal", "contract"]) {
      expect(pt[`${N}process.${chave}.notLinked`].endsWith("."), chave).toBe(true);
      expect(en[`${N}process.${chave}.notLinked`].endsWith("."), chave).toBe(true);
    }
  });
});
