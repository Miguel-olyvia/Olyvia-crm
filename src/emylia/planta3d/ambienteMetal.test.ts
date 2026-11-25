// 25/11: o ambiente dos metais tem de ter contraste (caixas muito mais claras do que o fundo); a conta do mapa em si precisa de WebGL e vê-se nas capturas.
import { describe, expect, it } from "vitest";
import { CAIXAS_AMBIENTE_METAL, FUNDO_AMBIENTE_METAL, contrasteDoAmbienteMetal } from "./ambienteMetal";

describe("o ambiente dos metais", () => {
  it("as caixas de luz são pelo menos 20 vezes mais luminosas do que o fundo", () => { expect(contrasteDoAmbienteMetal()).toBeGreaterThanOrEqual(20); });
  it("há zonas claras e zonas escuras: pelo menos três caixas fortes e uma escura (chão ou enchimento)", () => {
    expect(CAIXAS_AMBIENTE_METAL.filter((c) => c.k >= 4).length).toBeGreaterThanOrEqual(3);
    expect(CAIXAS_AMBIENTE_METAL.some((c) => c.k < 1)).toBe(true);
    expect(FUNDO_AMBIENTE_METAL).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
