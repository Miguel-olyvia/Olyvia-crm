// A tabela fundida (base + todos os modulos) e um modulo puro, sem hook: serve o useTranslation e o friendlyError.
import { describe, expect, it } from "vitest";
import { tabelaFundida } from "./tabelaFundida";
import { translations } from "./index";
import { rhExemploSubsidiosTranslations } from "./rhExemploSubsidios";

describe("tabelaFundida", () => {
  it("tem as chaves da tabela base, com o mesmo texto", () => {
    const base = translations as unknown as Record<string, Record<string, string>>;
    expect(tabelaFundida.pt["friendlyError.forbidden"]).toBe(base.pt["friendlyError.forbidden"]);
    expect(tabelaFundida.en["friendlyError.forbidden"]).toBe(base.en["friendlyError.forbidden"]);
  });

  it("tem as chaves dos modulos juntados (rhSubs.*, rhHeReal.*)", () => {
    expect(tabelaFundida.pt["rhSubs.erro.guardar"]).toBe((rhExemploSubsidiosTranslations as Record<string, Record<string, string>>).pt["rhSubs.erro.guardar"]);
    expect(tabelaFundida.en["rhHeReal.erro.generico"]).toMatch(/Could not complete/);
  });

  it("nao altera a tabela base importada", () => {
    expect((translations as unknown as Record<string, Record<string, string>>).pt["rhSubs.erro.guardar"]).toBeUndefined();
  });
});
