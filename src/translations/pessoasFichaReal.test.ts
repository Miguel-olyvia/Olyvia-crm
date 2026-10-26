import { describe, expect, it } from "vitest";
import { CHAVES_ERRO_NEG } from "@/hooks/pessoas/errosNeg";
import { pessoasFichaRealTranslations } from "./pessoasFichaReal";
import { pessoasPaginaTranslations } from "./pessoasPagina";

const { en, pt } = pessoasFichaRealTranslations;
const marcas = (texto: string): string[] => (texto.match(/\{\w+\}/g) ?? []).sort();

// As chaves que o código da ficha real usa (FichaReal, useAcoesFichaReal e adaptarAtividade).
const CHAVES_USADAS = [
  "opening", "notFound", "partialCall", "partialCallVisit", "partialVisit", "saving", "staleWarn", "unknownResult",
  "more.contactos", "more.visitas", "more.levantamentos", "more.atividade", "more.loading",
  "activity.snoozed", "activity.lost", "activity.reopened", "activity.won", "activity.deleted", "activity.restored",
  // A identidade (IdentidadeFichaReal) e o separador Submissões (SubmissoesFichaReal).
  "identity.title", "identity.type", "identity.typeLegend", "identity.person", "identity.company", "identity.name", "identity.companyName",
  "identity.firstName", "identity.lastName", "identity.edit", "identity.save", "identity.cancel", "identity.errorCompany", "identity.errorPerson",
  // A identidade com condomínio e o contacto editável (ContactoFichaReal).
  "identity.condominio", "identity.condominioName", "contact.title", "contact.phone", "contact.email", "contact.preferred", "contact.preferred.none", "contact.preferred.telefone", "contact.preferred.whatsapp", "contact.preferred.email", "contact.preferred.sms", "contact.time", "contact.time.none", "contact.time.manha", "contact.time.tarde", "contact.time.fim_do_dia", "contact.language", "contact.language.pt", "contact.language.en", "contact.language.fr", "contact.notSet", "contact.edit", "contact.save", "contact.cancel", "contact.saved", "contact.hint", "contact.errorEmail", "contact.errorPhone",
  "identity.saved",
  // A classificação MQL/SQL à mão (QualificacaoManualFichaReal).
  "qualify.title", "qualify.hint", "qualify.mql", "qualify.sql", "qualify.mqlDescription", "qualify.sqlDescription", "qualify.setMql", "qualify.setSql",
  "qualify.promote", "qualify.demote", "qualify.clear", "qualify.saved", "qualify.cleared",
  "subs.label", "subs.empty", "subs.loading", "subs.error", "subs.noCampaign", "subs.kind.submission", "subs.fields", "subs.none",
  "subs.review.pending", "subs.review.merged", "subs.review.new_lead", "subs.review.resolved",
  "subs.stage.novo", "subs.stage.contactado", "subs.stage.qualificado", "subs.stage.proposta", "subs.stage.ganho", "subs.stage.perdido",
  "subs.record.cliente", "subs.record.lead", "subs.match.email", "subs.match.telefone", "subs.match.ambos", "subs.match.conflito",
  "subs.conflict.title", "subs.conflict.unnamed", "subs.unsaved.email", "subs.unsaved.phone",
].map((c) => `pessoasPagina.real.ficha.${c}`);

describe("traduções da ficha real das Pessoas", () => {
  it("pt e en têm as mesmas chaves, com os mesmos marcadores", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(pt).sort());
    for (const chave of Object.keys(pt)) expect(marcas(en[chave]), chave).toEqual(marcas(pt[chave]));
  });

  it("todas têm o prefixo certo e nenhuma está vazia", () => {
    expect(Object.keys(pt).length).toBeGreaterThan(0);
    for (const [chave, texto] of [...Object.entries(pt), ...Object.entries(en)]) {
      expect(chave).toMatch(/^pessoasPagina\.real\.ficha\./);
      expect(texto.trim(), chave).not.toBe("");
    }
  });

  it("todas as chaves usadas existem em pt e en", () => {
    for (const chave of CHAVES_USADAS) {
      expect(pt[chave], chave).toBeTruthy();
      expect(en[chave], chave).toBeTruthy();
    }
  });

  it("a identidade não fala de NIF (a função da base não lhe toca)", () => {
    for (const [chave, texto] of [...Object.entries(pt), ...Object.entries(en)]) {
      if (chave.includes(".identity.")) expect(texto, chave).not.toMatch(/nif/i);
    }
  });

  it("as frases de coincidência levam os marcadores que o componente preenche", () => {
    expect(marcas(pt["pessoasPagina.real.ficha.subs.match.ambos"])).toEqual(["{email}", "{phone}", "{record}"]);
    expect(marcas(pt["pessoasPagina.real.ficha.subs.match.email"])).toEqual(["{email}", "{record}"]);
    expect(marcas(pt["pessoasPagina.real.ficha.subs.match.telefone"])).toEqual(["{phone}", "{record}"]);
    expect(marcas(pt["pessoasPagina.real.ficha.subs.match.conflito"])).toEqual([]);
  });

  it("o aviso de falha parcial diz as duas coisas: o contacto ficou e o encerramento não", () => {
    expect(pt["pessoasPagina.real.ficha.partialCall"]).toMatch(/contacto/i);
    expect(pt["pessoasPagina.real.ficha.partialCall"]).toMatch(/encerr/i);
    expect(en["pessoasPagina.real.ficha.partialCall"]).toMatch(/call|contact/i);
    expect(en["pessoasPagina.real.ficha.partialCall"]).toMatch(/clos/i);
  });

  it("o aviso de falha parcial da chamada com visita diz que o contacto ficou e a visita não", () => {
    expect(pt["pessoasPagina.real.ficha.partialCallVisit"]).toMatch(/contacto/i);
    expect(pt["pessoasPagina.real.ficha.partialCallVisit"]).toMatch(/visita não foi marcada/i);
    expect(en["pessoasPagina.real.ficha.partialCallVisit"]).toMatch(/logged/i);
    expect(en["pessoasPagina.real.ficha.partialCallVisit"]).toMatch(/visit was not booked/i);
  });

  it("o aviso de falha parcial da visita diz que a abordagem ficou encerrada e o resultado não", () => {
    expect(pt["pessoasPagina.real.ficha.partialVisit"]).toMatch(/encerrada/i);
    expect(pt["pessoasPagina.real.ficha.partialVisit"]).toMatch(/resultado/i);
    expect(en["pessoasPagina.real.ficha.partialVisit"]).toMatch(/closed/i);
    expect(en["pessoasPagina.real.ficha.partialVisit"]).toMatch(/result/i);
  });

  it("«A guardar…» e «A carregar…» existem com o acento e a reticência certos", () => {
    expect(pt["pessoasPagina.real.ficha.saving"]).toBe("A guardar…");
    expect(en["pessoasPagina.real.ficha.saving"]).toBe("Saving…");
    expect(pt["pessoasPagina.real.ficha.more.loading"]).toBe("A carregar…");
    expect(en["pessoasPagina.real.ficha.more.loading"]).toBe("Loading…");
  });

  it("cada «carregar mais» diz de que secção fala", () => {
    expect(pt["pessoasPagina.real.ficha.more.contactos"]).toBe("Carregar mais contactos");
    expect(pt["pessoasPagina.real.ficha.more.levantamentos"]).toBe("Carregar mais levantamentos");
    expect(en["pessoasPagina.real.ficha.more.atividade"]).toBe("Load more activity");
    expect(en["pessoasPagina.real.ficha.more.visitas"]).toBe("Load more visits");
  });

  it("a página junta estes textos nas duas línguas", () => {
    for (const chave of Object.keys(pt)) expect(pessoasPaginaTranslations.pt[chave]).toBe(pt[chave]);
    for (const chave of Object.keys(en)) expect(pessoasPaginaTranslations.en[chave]).toBe(en[chave]);
  });

  it("as chaves que o código já usa e reaproveita existem na página em pt e en", () => {
    const reaproveitadas = [
      "pessoasPagina.activity.noteAdded", "pessoasPagina.close.activity.closed", "pessoasPagina.close.activity.reopened",
      "pessoasPagina.real.noContact", "pessoasPagina.erroNeg.generico", ...Object.values(CHAVES_ERRO_NEG),
    ];
    for (const chave of reaproveitadas) {
      expect(pessoasPaginaTranslations.pt[chave], chave).toBeTruthy();
      expect(pessoasPaginaTranslations.en[chave], chave).toBeTruthy();
    }
  });
});
