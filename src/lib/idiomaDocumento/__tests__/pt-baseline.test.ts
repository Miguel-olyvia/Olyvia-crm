import { describe, expect, it, vi } from "vitest";
import { CENARIOS } from "./pt-baseline.fixtures";
import { PT_BASELINE_DOCUMENTO } from "./pt-baseline";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

// O português do contrato tem de sair IDÊNTICO ao de antes de existir o parâmetro `idioma`,
// quer ele seja omitido quer seja "pt" (ou um código sem palavras próprias, que cai no português).
describe("português do contrato idêntico ao baseline", () => {
  it("o baseline cobre todos os cenários (e só esses)", () => {
    expect(Object.keys(PT_BASELINE_DOCUMENTO).sort()).toEqual(Object.keys(CENARIOS).sort());
  });

  describe.each(Object.keys(CENARIOS))("%s", (nome) => {
    it("sem idioma", () => {
      expect(CENARIOS[nome]()).toBe(PT_BASELINE_DOCUMENTO[nome]);
    });
    it('com idioma "pt"', () => {
      expect(CENARIOS[nome]("pt")).toBe(PT_BASELINE_DOCUMENTO[nome]);
    });
    it('com um idioma sem palavras próprias ("fr")', () => {
      expect(CENARIOS[nome]("fr")).toBe(PT_BASELINE_DOCUMENTO[nome]);
    });
  });

  it("o baseline guarda também os defeitos que o português já tinha (não se corrigem neste passo)", () => {
    expect(PT_BASELINE_DOCUMENTO["variaveis.duracao"]).toContain("1 meses");
    expect(PT_BASELINE_DOCUMENTO["variaveis.extenso"]).toContain("undefined mil euros");
  });
});
