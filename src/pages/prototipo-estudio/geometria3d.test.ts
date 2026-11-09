// 5/11: o 3D sem bibliotecas: o chão primeiro, as paredes de trás antes das peças, só os lados das caixas virados para quem vê.
import { describe, expect, it } from "vitest";
import { projetar, sombrear, type Cena } from "./geometria3d";

const CENA: Cena = {
  chao: [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 150 }, { x: 0, y: 150 }], altura: 240, corParede: "#9aa0a6", corChao: "#2f3136",
  caixas: [{ id: "s", x: 80, y: 20, w: 36, h: 52, z0: 30, z1: 72, cor: "#f4f4f2", nome: "Sanita" }],
};

describe("vista3d", () => {
  it("o chão vem primeiro; cada caixa mostra o tampo e dois lados; as 4 paredes estão lá", () => {
    const { faces } = projetar(CENA, -0.6, 0.6);
    expect(faces[0].tipo).toBe("chao");
    expect(faces.filter((f) => f.tipo === "parede")).toHaveLength(4);
    expect(faces.filter((f) => f.id === "s")).toHaveLength(3);
  });

  it("as paredes da frente ficam cortadas (mais baixas) e são desenhadas depois das de trás", () => {
    const { faces } = projetar(CENA, 0, 0.6);
    const paredes = faces.filter((f) => f.tipo === "parede");
    const altura = (f: { pts: [number, number][] }) => Math.max(...f.pts.map((p) => p[1])) - Math.min(...f.pts.map((p) => p[1]));
    // de frente (rumo 0) a parede de baixo da planta é a da frente: está entre as últimas paredes e é a mais baixa
    expect(Math.min(...paredes.map(altura))).toBeLessThan(Math.max(...paredes.map(altura)) / 3);
    const inteiras = projetar(CENA, 0, 0.6, false).faces.filter((f) => f.tipo === "parede");
    expect(Math.min(...inteiras.map(altura))).toBeGreaterThan(50);
  });

  it("sombrear clareia e escurece sem sair das cores", () => {
    expect(sombrear("#808080", 0.5)).toBe("#404040");
    expect(sombrear("#808080", 2)).toBe("#ffffff");
    expect(sombrear("#000000", 1.5)).toBe("#808080");
  });
});
