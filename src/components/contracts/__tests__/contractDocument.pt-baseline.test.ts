import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AGORA_FIXO, CENARIOS } from "./contractDocument.baseline.fixtures";
import { PT_BASELINE_CONTRATO } from "./contractDocument.baseline";

vi.mock("@/integrations/supabase/client", async () => {
  const { makeFakeSupabase } = await import("./fakeSupabase");
  return { supabase: makeFakeSupabase() };
});

// O português do contrato (assinaturas, resolver, HTML de impressão e rodapé do PDF) tem de sair IDÊNTICO ao de
// antes de existirem versões por idioma, quer o idioma seja omitido quer seja "pt". O supabase está simulado.
describe("português do contrato idêntico ao baseline (assinaturas, resolver, impressão, rodapé)", () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(AGORA_FIXO);
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it("o baseline cobre todos os cenários (e só esses)", () => {
    expect(Object.keys(PT_BASELINE_CONTRATO).sort()).toEqual(Object.keys(CENARIOS).sort());
  });

  describe.each(Object.keys(CENARIOS))("%s", (nome) => {
    it("sem idioma", async () => {
      expect(await CENARIOS[nome]()).toBe(PT_BASELINE_CONTRATO[nome]);
    });
    it('com idioma "pt"', async () => {
      expect(await CENARIOS[nome]("pt")).toBe(PT_BASELINE_CONTRATO[nome]);
    });
  });
});
