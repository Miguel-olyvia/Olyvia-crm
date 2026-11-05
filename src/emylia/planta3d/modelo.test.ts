import { describe, expect, it } from "vitest";
import {
  areaPavimento, areaParedes, areaPoligono, autoIntersecao, comprimento, espacoVazio, normalizarContorno, paredesDoContorno, perimetro, trocosDeParede,
  ajustarGrelha, normalInterior, type Abertura,
} from "./modelo";

const quadrado = [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 2 }, { x: 0, y: 2 }];

describe("medidas do contorno", () => {
  it("área e perímetro de um rectângulo 3×2", () => {
    expect(areaPoligono(quadrado)).toBe(6);
    expect(perimetro(quadrado)).toBe(10);
  });
  it("área de um L", () => {
    expect(areaPoligono([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 4 }, { x: 0, y: 4 }])).toBe(12);
  });
  it("comprimento de uma parede e grelha de 5 cm", () => {
    expect(comprimento({ a: { x: 0, y: 0 }, b: { x: 3, y: 4 } })).toBe(5);
    expect(ajustarGrelha(1.234)).toBe(1.25);
    expect(ajustarGrelha(0.02)).toBe(0);
  });
});

describe("normalizarContorno", () => {
  it("ajusta à grelha de 5 cm", () => {
    const r = normalizarContorno([{ x: 0.01, y: 0.02 }, { x: 3.03, y: -0.01 }, { x: 3.02, y: 2.04 }, { x: -0.02, y: 1.97 }]);
    expect(r).toEqual({ ok: true, pontos: [{ x: 0, y: 0 }, { x: 3.05, y: 0 }, { x: 3.05, y: 2.05 }, { x: 0, y: 2.05 }] });
  });
  it("alinha à horizontal e à vertical as paredes quase retas (menos de 5 graus)", () => {
    const r = normalizarContorno([{ x: 0, y: 0 }, { x: 3, y: 0.15 }, { x: 3.1, y: 2 }, { x: 0, y: 2 }]);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.pontos[1].y).toBe(r.pontos[0].y); expect(r.pontos[2].x).toBe(r.pontos[1].x); }
  });
  it("não alinha uma diagonal a sério", () => {
    const r = normalizarContorno([{ x: 0, y: 0 }, { x: 3, y: 1.5 }, { x: 3, y: 3 }, { x: 0, y: 3 }]);
    expect(r.ok && r.pontos[1]).toEqual({ x: 3, y: 1.5 });
  });
  it("funde pontos a menos de 10 cm e fecha quando o último volta ao primeiro", () => {
    const r = normalizarContorno([...quadrado.slice(0, 2), { x: 3.04, y: 0.04 }, ...quadrado.slice(2), { x: 0.03, y: 0.02 }]);
    expect(r.ok && r.pontos.length).toBe(4);
  });
  it("recusa menos de três cantos e pontos em linha", () => {
    expect(normalizarContorno([{ x: 0, y: 0 }, { x: 1, y: 0 }]).ok).toBe(false);
    const linha = normalizarContorno([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }]);
    expect(linha.ok).toBe(false);
  });
  it("recusa auto-intersecções com mensagem", () => {
    const gravata = [{ x: 0, y: 0 }, { x: 2, y: 2 }, { x: 2, y: 0 }, { x: 0, y: 2 }];
    expect(autoIntersecao(gravata)).toEqual([1, 3]);
    const r = normalizarContorno(gravata);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toMatch(/cruzam/);
  });
  it("um contorno normal não tem auto-intersecção", () => {
    expect(autoIntersecao(quadrado)).toBeNull();
  });
});

describe("paredes e aberturas", () => {
  const paredes = paredesDoContorno(quadrado);
  it("uma parede por canto, ligadas", () => {
    expect(paredes.map((p) => p.id)).toEqual(["p1", "p2", "p3", "p4"]);
    expect(paredes[3].b).toEqual(paredes[0].a);
    expect(paredes[0].espessura).toBe(0.1);
  });
  it("a normal aponta para o interior", () => {
    expect(normalInterior(paredes, 0)).toEqual({ x: 0, y: 1 });
    expect(normalInterior(paredes, 1).x).toBe(-1);
  });
  it("sem aberturas, um troço só", () => {
    expect(trocosDeParede(paredes[0], [], 2.4)).toEqual([{ de: 0, ate: 3, z0: 0, z1: 2.4 }]);
  });
  it("uma porta corta em esquerda, verga e direita", () => {
    const porta: Abertura = { id: "a", tipo: "porta", parede: "p1", posicao: 1, largura: 0.8, altura: 2.1, peitoril: 0 };
    expect(trocosDeParede(paredes[0], [porta], 2.4)).toEqual([
      { de: 0, ate: 1, z0: 0, z1: 2.4 }, { de: 1, ate: 1.8, z0: 2.1, z1: 2.4 }, { de: 1.8, ate: 3, z0: 0, z1: 2.4 },
    ]);
  });
  it("uma janela deixa peitoril e verga", () => {
    const janela: Abertura = { id: "j", tipo: "janela", parede: "p1", posicao: 1, largura: 1, altura: 1.2, peitoril: 0.9 };
    const t = trocosDeParede(paredes[0], [janela], 2.4);
    expect(t).toContainEqual({ de: 1, ate: 2, z0: 0, z1: 0.9 });
    expect(t).toContainEqual({ de: 1, ate: 2, z0: 2.1, z1: 2.4 });
    expect(t).toHaveLength(4);
  });
  it("uma abertura fora da parede é recortada, e as de outra parede ignoram-se", () => {
    const larga: Abertura = { id: "a", tipo: "porta", parede: "p1", posicao: 2.8, largura: 0.8, altura: 2.1, peitoril: 0 };
    const t = trocosDeParede(paredes[0], [larga, { ...larga, id: "b", parede: "p2" }], 2.4);
    expect(t.at(-1)).toEqual({ de: 2.2, ate: 3, z0: 2.1, z1: 2.4 });
    expect(t[0]).toEqual({ de: 0, ate: 2.2, z0: 0, z1: 2.4 });
  });
  it("duas aberturas seguidas e sobrepostas não duplicam troços", () => {
    const a: Abertura = { id: "a", tipo: "janela", parede: "p1", posicao: 0.5, largura: 1, altura: 1, peitoril: 1 };
    const b: Abertura = { ...a, id: "b", posicao: 1.2 };
    const t = trocosDeParede(paredes[0], [a, b], 2.4);
    const cheios = t.filter((x) => x.z0 === 0 && x.z1 === 2.4);
    expect(cheios).toEqual([{ de: 0, ate: 0.5, z0: 0, z1: 2.4 }, { de: 2.2, ate: 3, z0: 0, z1: 2.4 }]);
  });
});

describe("áreas do espaço", () => {
  it("chão e paredes descontam as aberturas", () => {
    const e = { ...espacoVazio("casa_banho", "WC"), paredes: paredesDoContorno(quadrado) };
    expect(areaPavimento(e)).toBe(6);
    expect(areaParedes(e)).toBe(24);
    const comPorta = { ...e, aberturas: [{ id: "a", tipo: "porta" as const, parede: "p1", posicao: 1, largura: 0.8, altura: 2.1, peitoril: 0 }] };
    expect(areaParedes(comPorta)).toBe(22.32);
  });
});
