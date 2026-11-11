// 9/11: as regras da planta no Estúdio: o que não cabe, as peças em cima umas das outras, a sanita e o bidé, as portas na parede.
import { describe, expect, it } from "vitest";
import { avisosDaPlanta, cantos, colarAParede, cortarCanto, ehDiagonal, retangulo, type Planta } from "./planta";

const sala = (pecas: Planta["pecas"]): Planta => ({ o: { x: 0, y: 0 }, paredes: retangulo(200, 250), pecas });

describe("as regras da planta", () => {
  it("uma peça que sai da planta dá alerta", () => {
    const a = avisosDaPlanta(sala([{ id: "b", tipo: "banheira", x: -20, y: 0, w: 170, h: 70 }]));
    expect(a[0].texto).toMatch(/não cabe/);
    expect(avisosDaPlanta(sala([{ id: "b", tipo: "banheira", x: 0, y: 0, w: 170, h: 70 }]))).toHaveLength(0);
  });
  it("a sanita e o bidé precisam de 20 cm entre eles", () => {
    expect(avisosDaPlanta(sala([{ id: "s", tipo: "sanita", x: 0, y: 0, w: 36, h: 52 }, { id: "b", tipo: "bide", x: 46, y: 0, w: 36, h: 52 }]))[0].texto).toMatch(/ficam 10 cm/);
    expect(avisosDaPlanta(sala([{ id: "s", tipo: "sanita", x: 0, y: 0, w: 36, h: 52 }, { id: "b", tipo: "bide", x: 60, y: 0, w: 36, h: 52 }]))).toHaveLength(0);
  });
  it("as peças em cima umas das outras dão alerta", () => {
    expect(avisosDaPlanta(sala([{ id: "s", tipo: "sanita", x: 0, y: 0, w: 36, h: 52 }, { id: "m", tipo: "movel", x: 20, y: 10, w: 60, h: 45 }]))[0].texto).toMatch(/em cima/);
  });
  it("a porta fica colada à parede mais perto", () => {
    const p = sala([]);
    const porta = colarAParede({ id: "p", tipo: "porta", x: 60, y: 30, w: 80, h: 8 }, p);
    expect(porta.y).toBe(-4); // a parede de cima (y = 0), com o meio na linha
    const lado = colarAParede({ id: "j", tipo: "janela", x: 170, y: 120, w: 100, h: 8 }, p);
    expect(lado).toMatchObject({ x: 196, w: 8, h: 100 });
  });
});

describe("portas e peças nas paredes em diagonal (11/11)", () => {
  // 200 × 250 com o canto de cima à direita cortado a 45° (60 cm de cada lado)
  const comDiagonal = (pecas: Planta["pecas"]): Planta => {
    const base = { o: { x: 0, y: 0 }, paredes: retangulo(200, 250) };
    const c = cortarCanto(base, 1, 60)!;
    return { ...c, pecas };
  };
  it("a porta perto da diagonal cola-se a ela, rodada a 45°, com o meio na linha da parede", () => {
    const p = comDiagonal([]);
    const pts = cantos(p.paredes, p.o);
    const i = p.paredes.findIndex((w) => ehDiagonal(w.r));
    const a = pts[i], z = pts[i + 1], meio = { x: (a.x + z.x) / 2, y: (a.y + z.y) / 2 };
    const porta = colarAParede({ id: "p", tipo: "porta", x: meio.x - 10, y: meio.y + 5, w: 70, h: 8 }, p);
    expect(Math.abs(porta.rot ?? 0)).toBe(45);
    const cx = porta.x + porta.w / 2, cy = porta.y + porta.h / 2;
    // o meio da porta fica na parede (a distância do centro à reta da parede é ~0)
    const dist = Math.abs((z.x - a.x) * (a.y - cy) - (a.x - cx) * (z.y - a.y)) / Math.hypot(z.x - a.x, z.y - a.y);
    expect(dist).toBeLessThan(1.5);
    expect(porta.w).toBe(70);
  });
  it("numa parede direita, a porta fica direita (sem rotação)", () => {
    const porta = colarAParede({ id: "p", tipo: "porta", x: 60, y: 240, w: 70, h: 8, rot: 45 }, comDiagonal([]));
    expect(porta.rot).toBeUndefined();
  });
  it("um móvel rodado a 45° encostado à diagonal cabe; o mesmo sem rodar, sai da planta", () => {
    const rodado = avisosDaPlanta(comDiagonal([{ id: "m", tipo: "movel", x: 141, y: 29, w: 40, h: 20, rot: 45 }]));
    expect(rodado.filter((a) => /não cabe/.test(a.texto))).toHaveLength(0);
    const direito = avisosDaPlanta(comDiagonal([{ id: "m", tipo: "movel", x: 150, y: 2, w: 48, h: 20 }]));
    expect(direito.some((a) => /não cabe/.test(a.texto))).toBe(true);
  });
});
