// getLocalizedFallback fora do React tem de resolver TODAS as chaves que o useTranslation resolve (rhHeReal.*, rhSubs.*, ...), e nao so
// as da tabela base: sem isso o ecra mostrava a chave em bruto. Sem nenhum mock de friendlyError nem das traducoes.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getLocalizedFallback, getGenericFriendlyFallback } from "./friendlyError";
import { translations } from "@/translations/index";
import { rhExemploHorasExtraRealTranslations } from "@/translations/rhExemploHorasExtraReal";
import { rhExemploSubsidiosTranslations } from "@/translations/rhExemploSubsidios";

const lingua = (l: string) => window.localStorage.setItem("language", l);

beforeEach(() => window.localStorage.clear());
afterEach(() => window.localStorage.clear());

describe("getLocalizedFallback: chaves das tabelas juntadas", () => {
  it.each(["rhHeReal.erro.generico", "rhHeReal.contagem.erro.folhaFechadaDesligar"])("%s resolve para o texto pt e en, nunca em bruto", (chave) => {
    lingua("pt");
    expect(getLocalizedFallback(chave)).toBe(rhExemploHorasExtraRealTranslations.pt[chave as keyof typeof rhExemploHorasExtraRealTranslations.pt]);
    expect(getLocalizedFallback(chave)).not.toBe(chave);
    lingua("en");
    expect(getLocalizedFallback(chave)).toBe(rhExemploHorasExtraRealTranslations.en[chave as keyof typeof rhExemploHorasExtraRealTranslations.en]);
    expect(getLocalizedFallback(chave)).not.toBe(chave);
  });

  it.each(["rhSubs.erro.guardar", "rhSubs.erro.semPermissao", "rhSubs.erro.meses"])("%s resolve para o texto pt e en, nunca em bruto", (chave) => {
    const tabela = rhExemploSubsidiosTranslations as Record<string, Record<string, string>>;
    lingua("pt");
    expect(getLocalizedFallback(chave)).toBe(tabela.pt[chave]);
    lingua("en");
    expect(getLocalizedFallback(chave)).toBe(tabela.en[chave]);
  });

  it("uma lingua sem a chave cai para o ingles; uma chave que nao existe em lado nenhum devolve a propria chave", () => {
    lingua("de");
    expect(getLocalizedFallback("rhSubs.erro.guardar")).toBe((rhExemploSubsidiosTranslations as Record<string, Record<string, string>>).en["rhSubs.erro.guardar"]);
    expect(getLocalizedFallback("chave.que.nao.existe")).toBe("chave.que.nao.existe");
  });
});

describe("getLocalizedFallback: chamadores antigos (so tabela base) continuam iguais", () => {
  it.each(["en", "pt"] as const)("friendlyError.* em %s", (l) => {
    lingua(l);
    const base = translations as unknown as Record<string, Record<string, string>>;
    expect(getLocalizedFallback("friendlyError.forbidden")).toBe(base[l]["friendlyError.forbidden"]);
    expect(getGenericFriendlyFallback()).toBe(base[l]["friendlyError.unexpectedRetry"]);
  });
});
