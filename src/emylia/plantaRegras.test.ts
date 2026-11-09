// 9/11: as regras da planta no Estúdio: o que não cabe, as peças em cima umas das outras, a sanita e o bidé, as portas na parede.
import { describe, expect, it } from "vitest";
import { avisosDaPlanta, colarAParede, retangulo, type Planta } from "./planta";

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
