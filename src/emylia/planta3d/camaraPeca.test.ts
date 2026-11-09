// A câmara que se aproxima da peça escolhida fica dentro da divisão e nunca dentro de outra peça (senão essa peça desaparece: «o armário fugiu»).
import { describe, expect, it } from "vitest";
import { retangulo, type PecaPlanta, type Planta } from "../planta";
import { deLegado, modeloGenerico } from "./ligacao";
import { camaraDaPeca } from "./camaraPeca";

// casa de banho 2,4 × 2 m: lavatório largo de 120 cm encostado à parede de cima e um móvel alto encostado à parede de baixo, à frente dele
const pc = (o: Partial<PecaPlanta>): PecaPlanta => ({ id: "x", tipo: "movel", x: 0, y: 0, w: 60, h: 45, rot: 0, mont: "chao", alt: 0, esp: false, ...o });
const planta: Planta = {
  o: { x: 0, y: 0 }, paredes: retangulo(240, 200),
  pecas: [pc({ id: "lav", tipo: "movel", x: 60, y: 0, w: 120, h: 46 }), pc({ id: "arm", tipo: "coluna", x: 80, y: 155, w: 80, h: 45, rot: 180 })],
};
const res = deLegado(planta, { tipo: "casa_banho", nome: "Teste", peDireito: 2.6, produtos: {} });

describe("câmara da peça escolhida", () => {
  it("fica dentro da divisão, mesmo numa peça larga", () => {
    if (!res.ok) throw new Error(res.erro);
    const c = camaraDaPeca(res.espaco, res.modelos, "lav")!;
    expect(c.pos[0]).toBeGreaterThan(0); expect(c.pos[0]).toBeLessThan(2.4);
    expect(c.pos[2]).toBeGreaterThan(0); expect(c.pos[2]).toBeLessThan(2.0);
    expect(c.pos[1]).toBeLessThanOrEqual(2.6);
  });
  it("não cai dentro de outra peça (sobe acima dela)", () => {
    if (!res.ok) throw new Error(res.erro);
    const c = camaraDaPeca(res.espaco, res.modelos, "lav")!, arm = res.espaco.pecas.find((p) => p.id === "arm")!, m = res.modelos[arm.produtoId] ?? modeloGenerico("coluna", 80, 45);
    const dentro = Math.abs(c.pos[0] - arm.x) <= arm.largura / 2 && Math.abs(c.pos[2] - arm.y) <= arm.profundidade / 2 && c.pos[1] <= arm.altura + m.mockup3d.altura;
    expect(dentro).toBe(false);
  });
});
