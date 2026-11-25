// 24/11 (fase 1): a posição das três cotas (largura, profundidade, altura) à volta da caixa da peça, e quando uma cota está no ecrã. Funções puras, sem three nem React.
import { describe, expect, it } from "vitest";
import { ecranDeVistaPadrao, cotasDaPeca, noEcra, sobreposicao } from "./cotasPeca";

const por = (cs: ReturnType<typeof cotasDaPeca>, chave: string) => cs.find((c) => c.chave === chave)!;

describe("cotasDaPeca: três cotas, com o rótulo e a chaveta de cada uma", () => {
  it("largura no topo da frente, profundidade em baixo à direita e, numa peça de pé, a altura à esquerda (como até aqui)", () => {
    const cs = cotasDaPeca(0.4, 0.25, 1.6);
    expect(cs.map((c) => c.chave)).toEqual(["largura", "profundidade", "altura"]);
    expect(por(cs, "largura").rotulo).toBe("Largura 40 cm");
    expect(por(cs, "profundidade").rotulo).toBe("Profundidade 25 cm");
    expect(por(cs, "altura").rotulo).toBe("Altura 160 cm");
    expect(por(cs, "altura").meio[0]).toBeLessThan(-0.2);
    expect(por(cs, "largura").meio[1]).toBeCloseTo(1.6);
    expect(por(cs, "profundidade").meio[0]).toBeGreaterThan(0.2);
  });
  it("cada cota tem quatro pontos (a chaveta: sai da aresta, corre ao longo dela e volta)", () => {
    for (const c of cotasDaPeca(0.4, 0.25, 1.6)) expect(c.pontos).toHaveLength(4);
  });
  it("numa peça deitada (muito mais larga do que alta) o rótulo da altura passa para o canto oposto: já não fica quase no mesmo ponto do ecrã que o da largura", () => {
    const w = 0.4, d = 0.25, h = 0.25;
    const cs = cotasDaPeca(w, d, h);
    const altura = por(cs, "altura"), largura = por(cs, "largura");
    expect(altura.meio[0]).toBeGreaterThan(w / 2);
    expect(sobreposicao(ecranDeVistaPadrao(altura.meio), ecranDeVistaPadrao(largura.meio), Math.max(w, d, h))).toBeGreaterThanOrEqual(1);
  });
  it("a escolha melhora sempre: nunca fica com os rótulos mais sobrepostos do que a posição de omissão (à esquerda)", () => {
    for (const w of [0.1, 0.25, 0.4, 0.8, 1.6]) for (const d of [0.1, 0.25, 0.6, 1.2]) for (const h of [0.05, 0.1, 0.25, 0.6, 1.6, 2.4]) {
      const cs = cotasDaPeca(w, d, h), alt = por(cs, "altura");
      const grande = Math.max(w, d, h);
      const pior = (meio: [number, number, number]) => Math.min(sobreposicao(ecranDeVistaPadrao(meio), ecranDeVistaPadrao(por(cs, "largura").meio), grande), sobreposicao(ecranDeVistaPadrao(meio), ecranDeVistaPadrao(por(cs, "profundidade").meio), grande));
      const off = Math.min(0.3, Math.max(0.07, grande * 0.1));
      const esquerda: [number, number, number] = [-w / 2 - off, h / 2, d / 2];
      expect(pior(alt.meio), `${w}x${d}x${h}`).toBeGreaterThanOrEqual(pior(esquerda) - 1e-9);
    }
  });
  it("as medidas arredondam como nos rótulos de sempre (87,5)", () => {
    expect(por(cotasDaPeca(0.875, 0.3, 0.5), "largura").rotulo).toBe("Largura 87,5 cm");
  });
});

describe("noEcra: uma cota só se mostra se o ponto dela está dentro do ecrã", () => {
  it("dentro (coordenadas normalizadas -1 a 1, à frente da câmara): sim", () => {
    expect(noEcra({ x: 0, y: 0, z: 0.5 })).toBe(true);
    expect(noEcra({ x: 0.9, y: -0.9, z: 0.5 })).toBe(true);
  });
  it("fora de qualquer margem, ou atrás da câmara: não (ao zoom máximo as cotas saem do enquadramento)", () => {
    expect(noEcra({ x: 1.2, y: 0, z: 0.5 })).toBe(false);
    expect(noEcra({ x: 0, y: -1.5, z: 0.5 })).toBe(false);
    expect(noEcra({ x: 0, y: 0, z: 1.2 })).toBe(false);
    expect(noEcra({ x: 0, y: 0, z: -1.2 })).toBe(false);
  });
  it("com uma margem (o rótulo tem largura): um ponto colado ao bordo já não conta", () => {
    expect(noEcra({ x: 0.98, y: 0, z: 0.5 })).toBe(false);
    expect(noEcra({ x: 0.98, y: 0, z: 0.5 }, 0)).toBe(true);
  });
});
