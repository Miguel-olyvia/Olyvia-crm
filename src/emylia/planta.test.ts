// 5/11 (Rúben, a visita real): a planta da divisão em vez do croqui em papel. As paredes à volta dão os m² do chão e das paredes.
import { describe, expect, it } from "vitest";
import { areaChaoM2, areaParedesM2, cantos, emL, faltaFechar, juntarPeca, lerPlanta, gravarPlanta, peDireitoDoCampo, perimetroM, retangulo, type Planta } from "./planta";

describe("planta", () => {
  it("um retângulo de 234 x 177 fecha e dá 4,14 m² de chão e 8,22 m de paredes", () => {
    const p = retangulo(234, 177);
    expect(faltaFechar(p)).toBe(0);
    expect(cantos(p).slice(0, 4)).toEqual([{ x: 0, y: 0 }, { x: 234, y: 0 }, { x: 234, y: 177 }, { x: 0, y: 177 }]);
    expect(areaChaoM2(p)).toBe(4.14);
    expect(perimetroM(p)).toBe(8.22);
  });

  it("em L: o canto cortado sai à área, e o perímetro é o do retângulo de fora", () => {
    const p = emL(234, 226, 63, 74);
    expect(faltaFechar(p)).toBe(0);
    expect(areaChaoM2(p)).toBe(Math.round(((234 * 226 - 63 * 74) / 10000) * 100) / 100);
    expect(perimetroM(p)).toBe(9.2);
  });

  it("uma planta que não fecha não dá m² e diz quanto falta", () => {
    const p = [{ c: 200, vira: "dir" as const }, { c: 100, vira: "dir" as const }, { c: 150, vira: "dir" as const }, { c: 100, vira: "dir" as const }];
    expect(faltaFechar(p)).toBe(50);
    expect(areaChaoM2(p)).toBeNull();
  });

  it("paredes: perímetro × pé-direito, menos a porta (2 m de altura) e a janela (1 m)", () => {
    const base: Planta = { paredes: retangulo(200, 150), pecas: [] };
    expect(areaParedesM2(base, 2.5)).toBe(17.5);
    const comAberturas = juntarPeca(juntarPeca(base, "porta", "p"), "janela", "j");
    expect(areaParedesM2(comAberturas, 2.5)).toBe(Math.round((17.5 - 0.8 * 2 - 1 * 1) * 100) / 100);
    expect(areaParedesM2(base, 0)).toBeNull();
  });

  it("o pé-direito lê-se do campo da visita", () => {
    expect(peDireitoDoCampo("2,6 m")).toBe(2.6);
    expect(peDireitoDoCampo("3 m ou mais")).toBe(3);
    expect(peDireitoDoCampo("")).toBeNull();
  });

  it("grava e lê; o que não se percebe não rebenta", () => {
    const p = juntarPeca({ paredes: retangulo(234, 177), pecas: [] }, "base", "b1");
    expect(lerPlanta(gravarPlanta(p))).toEqual(p);
    expect(lerPlanta("não é json")).toBeNull();
    expect(lerPlanta(JSON.stringify({ paredes: [{ c: 1, vira: "dir" }] }))).toBeNull();
    expect(lerPlanta(JSON.stringify({ paredes: retangulo(10, 10), pecas: [{ id: "x", tipo: "foguetão", x: 0, y: 0, w: 1, h: 1 }] }))?.pecas).toEqual([]);
  });

  it("uma peça nova fica ao meio da planta, com o tamanho de sempre", () => {
    const p = juntarPeca({ paredes: retangulo(200, 150), pecas: [] }, "sanita", "s");
    expect(p.pecas[0]).toEqual({ id: "s", tipo: "sanita", w: 36, h: 55, x: 82, y: 48 });
  });
});
