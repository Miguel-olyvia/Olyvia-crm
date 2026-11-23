import { describe, expect, it } from "vitest";
import { visitConfirmationTranslations } from "../visitConfirmation";

describe("traducoes da confirmacao da visita", () => {
  const langs = ["en", "pt", "es", "fr", "de"];
  const base = Object.keys(visitConfirmationTranslations.pt).sort();

  it("as cinco linguas existem", () => {
    expect(Object.keys(visitConfirmationTranslations).sort()).toEqual([...langs].sort());
  });

  it.each(langs)("%s tem exactamente as mesmas chaves que pt, sem textos vazios", (lang) => {
    const dict = visitConfirmationTranslations[lang];
    expect(Object.keys(dict).sort()).toEqual(base);
    for (const value of Object.values(dict)) expect(value.trim().length).toBeGreaterThan(0);
  });

  it.each(langs)("%s mantem os parametros {time} {error} {reason} {count}", (lang) => {
    const dict = visitConfirmationTranslations[lang];
    for (const key of base) {
      const params = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
      expect(params(dict[key])).toEqual(params(visitConfirmationTranslations.pt[key]));
    }
  });

  it("os motivos de nao envio da funcao tem texto", () => {
    for (const code of ["not_confirmed", "past", "time_changed", "visit_gone", "mode_booking"]) {
      expect(visitConfirmationTranslations.pt[`visitConfirmation.reason.${code}`]).toBeTruthy();
    }
  });
});
