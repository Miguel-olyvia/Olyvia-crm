// Modo Andar: a colisão simples (não sai da divisão, não entra nas peças; as baixas pisam-se).
import { describe, expect, it } from "vitest";
import { retangulo, type Planta } from "../planta";
import { deLegado } from "./ligacao";
import { podeEstar } from "./Andar";

const planta: Planta = { o: { x: 0, y: 0 }, paredes: retangulo(300, 200), pecas: [{ id: "m", tipo: "movel", x: 100, y: 0, w: 100, h: 50, rot: 0, mont: "chao", alt: 0, esp: false }] };
const res = deLegado(planta, { tipo: "casa_banho", nome: "T", peDireito: 2.6, produtos: {} });

describe("andar: onde se pode estar", () => {
  it("no meio sim; fora da divisão, rente à parede ou dentro de uma peça não", () => {
    if (!res.ok) throw new Error(res.erro);
    const { espaco, modelos } = res;
    expect(podeEstar(espaco, modelos, 1.5, 1.2, 1.6)).toBe(true);
    expect(podeEstar(espaco, modelos, 3.5, 1.0, 1.6)).toBe(false);
    expect(podeEstar(espaco, modelos, 0.1, 1.0, 1.6)).toBe(false);
    expect(podeEstar(espaco, modelos, 1.5, 0.3, 1.6)).toBe(false);
  });
});
