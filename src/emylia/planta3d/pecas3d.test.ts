import { describe, expect, it } from "vitest";
import { retangulo, type PecaPlanta, type Planta } from "../planta";
import {
  FORA_DA_DIVISAO, ajustarPeca, avisosDaPlanta, cantosPeca, centroPeca, corrigirDentro, encostarParede, normalInteriorCm, normalizarAngulo, ocupacao, paredeMaisPertoCm,
  moverPara, paredeOposta, pecaDentro, poligonoDe, rodarPeca, sobrepoe, sobreposicoes,
} from "./pecas3d";

// divisão de 3 m por 2 m: paredes 0 (cima), 1 (direita), 2 (baixo), 3 (esquerda)
const sala = (pecas: PecaPlanta[] = []): Planta => ({ o: { x: 0, y: 0 }, paredes: retangulo(300, 200), pecas });
const poly = poligonoDe(sala())!;
const pc = (o: Partial<PecaPlanta> = {}): PecaPlanta => ({ id: "a", tipo: "movel", x: 0, y: 0, w: 50, h: 50, rot: 0, ...o });

describe("polígono e normais", () => {
  it("só há polígono com a planta fechada", () => {
    expect(poly).toHaveLength(4);
    expect(poligonoDe({ o: { x: 0, y: 0 }, paredes: retangulo(300, 200).slice(0, 3), pecas: [] })).toBeNull();
  });
  it("a normal de cada parede aponta para dentro", () => {
    expect([0, 1, 2, 3].map((i) => normalInteriorCm(poly, i))).toEqual([{ x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }, { x: 1, y: 0 }]);
  });
  it("a parede mais próxima de um ponto", () => {
    expect(paredeMaisPertoCm(poly, { x: 150, y: 20 })).toMatchObject({ i: 0, d: 20, ao: 150 });
    expect(paredeMaisPertoCm(poly, { x: 290, y: 100 })).toMatchObject({ i: 1, d: 10 });
  });
});

describe("rotação", () => {
  it("os cantos rodam em torno do centro", () => {
    const c = cantosPeca({ x: 0, y: 0, w: 40, h: 20, rot: 90 }).map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }));
    expect(c).toEqual([{ x: 30, y: -10 }, { x: 30, y: 30 }, { x: 10, y: 30 }, { x: 10, y: -10 }]);
    expect(centroPeca({ x: 0, y: 0, w: 40, h: 20 })).toEqual({ x: 20, y: 10 });
  });
  it("normaliza os ângulos", () => {
    expect(normalizarAngulo(-90)).toBe(270);
    expect(normalizarAngulo(450)).toBe(90);
    expect(normalizarAngulo(359.6)).toBe(0);
  });
  it("uma peça de chão roda 90 graus em torno do centro", () => {
    const r = rodarPeca(sala(), pc({ x: 100, y: 80 }), 90);
    expect(r.ok && r.peca.rot).toBe(90);
    expect(r.ok && centroPeca(r.peca)).toEqual({ x: 125, y: 105 });
  });
});

describe("encosto à parede (peças de parede)", () => {
  const espelho = pc({ id: "e", w: 60, h: 3, mont: "parede", alt: 100, dh: 80, x: 120, y: 40 });
  it("encosta à parede mais próxima com a traseira rente e a frente para dentro", () => {
    const r = encostarParede(poly, espelho);
    expect(r).toMatchObject({ parede: 0, ao: 150 });
    expect(r.peca).toMatchObject({ x: 120, y: 0, rot: 0 });
  });
  it("na parede da direita roda 270 graus e fica rente a ela", () => {
    const r = encostarParede(poly, { ...espelho, x: 250, y: 90 });
    expect(r.parede).toBe(1);
    expect(r.peca.rot).toBe(270);
    expect(r.peca.x + r.peca.w / 2 + r.peca.h / 2).toBeCloseTo(300 + 0, 0);
  });
  it("a posição ao longo da parede fica entre os extremos", () => {
    expect(encostarParede(poly, { ...espelho, x: -10, y: 5 }, 0).ao).toBe(30);
    expect(encostarParede(poly, espelho, 0, 999).ao).toBe(270);
  });
  it("ajustarPeca encosta a peça de parede e guarda a altura", () => {
    const r = ajustarPeca(sala(), espelho);
    expect(r.ok && r.peca).toMatchObject({ alt: 100, y: 0, rot: 0, mont: "parede" });
  });
  it("uma peça de parede largada fora da divisão encosta à parede mais próxima", () => {
    const r = ajustarPeca(sala(), { ...espelho, x: 140, y: -300 });
    expect(r.ok && r.peca.y).toBe(0);
  });
  it("rodar uma peça de parede passa-a para a parede oposta, virada para dentro", () => {
    const e = ajustarPeca(sala(), espelho);
    if (!e.ok) throw new Error("ajuste");
    expect(paredeOposta(poly, e.peca, 0)).toBe(2);
    const r = rodarPeca(sala(), e.peca, 90);
    expect(r.ok && r.peca).toMatchObject({ rot: 180, alt: 100 });
    expect(r.ok && r.peca.y + r.peca.h).toBeCloseTo(200, 0);
  });
});

describe("limite dentro da divisão (o defeito da peça fora das paredes)", () => {
  it("dentro / fora", () => {
    expect(pecaDentro(poly, pc({ x: 100, y: 80 }))).toBe(true);
    expect(pecaDentro(poly, pc({ x: 400, y: 80 }))).toBe(false);
    expect(pecaDentro(poly, pc({ x: 275, y: 80 }))).toBe(false);
  });
  it("uma peça largada fora encosta ao ponto mais próximo dentro", () => {
    for (const [x, y] of [[400, 80], [-120, 80], [100, -200], [100, 500], [290, 190]]) {
      const r = corrigirDentro(poly, pc({ x, y }));
      expect(r.ok).toBe(true);
      expect(r.ok && pecaDentro(poly, r.peca)).toBe(true);
    }
  });
  it("uma peça rodada que sai pelo canto volta a caber", () => {
    const r = corrigirDentro(poly, pc({ x: 270, y: 170, w: 60, h: 20, rot: 45 }));
    expect(r.ok && pecaDentro(poly, r.peca)).toBe(true);
  });
  it("uma peça maior do que a divisão é recusada com «Fora da divisão»", () => {
    const r = corrigirDentro(poly, pc({ w: 500, h: 500 }));
    expect(r).toEqual({ ok: false, erro: FORA_DA_DIVISAO });
    expect(FORA_DA_DIVISAO).toMatch(/^Fora da divisão/);
  });
  it("sem planta fechada não se mexe na peça", () => {
    const r = ajustarPeca({ o: { x: 0, y: 0 }, paredes: [], pecas: [] }, pc({ x: 9999 }));
    expect(r.ok && r.peca.x).toBe(9999);
  });
  it("uma peça de chão, ao largar perto de uma parede, vira as costas a ela", () => {
    const r = ajustarPeca(sala(), pc({ x: 5, y: 80, w: 40, h: 40, rot: 0 }), { orientar: true });
    expect(r.ok && r.peca.rot).toBe(90);
  });
  it("portas e janelas do desenho antigo ficam como estão", () => {
    const porta: PecaPlanta = { id: "p", tipo: "porta", x: 100, y: -4, w: 80, h: 8 };
    expect(ajustarPeca(sala(), porta)).toEqual({ ok: true, peca: porta });
  });
});

describe("sobreposição e capacidade (avisos, não bloqueiam)", () => {
  it("duas peças de chão que se cruzam sobrepõem-se; encostadas, não", () => {
    expect(sobrepoe(pc({ x: 0, y: 0 }), pc({ x: 30, y: 30 }))).toBe(true);
    expect(sobrepoe(pc({ x: 0, y: 0 }), pc({ x: 50, y: 0 }))).toBe(false);
    expect(sobrepoe(pc({ x: 0, y: 0 }), pc({ x: 100, y: 100 }))).toBe(false);
  });
  it("a rotação conta", () => {
    expect(sobrepoe(pc({ x: 0, y: 0, w: 100, h: 10 }), pc({ x: 45, y: 40, w: 10, h: 10 }))).toBe(false);
    expect(sobrepoe(pc({ x: 0, y: 0, w: 100, h: 10, rot: 90 }), pc({ x: 45, y: 40, w: 10, h: 10 }))).toBe(true);
  });
  it("peças de parede só se sobrepõem se as alturas também se tocam", () => {
    const a = pc({ id: "a", mont: "parede", alt: 100, dh: 80 }), b = pc({ id: "b", mont: "parede", alt: 120, dh: 70 }), c = pc({ id: "c", mont: "parede", alt: 200, dh: 30 });
    expect(sobreposicoes([a, b]).map(([x, y]) => x.id + y.id)).toEqual(["ab"]);
    expect(sobreposicoes([a, c])).toEqual([]);
  });
  it("uma peça de parede não colide com uma de chão (o espelho fica por cima do lavatório)", () => {
    expect(sobreposicoes([pc({ id: "a", mont: "parede", alt: 100, dh: 80 }), pc({ id: "b" })])).toEqual([]);
  });
  it("avisos em texto: fora, sobreposição e peças a mais", () => {
    expect(avisosDaPlanta(sala([pc({ x: 100, y: 80 })]))).toEqual([]);
    expect(avisosDaPlanta(sala([pc({ x: 400, y: 80, nome: "Sanita" })]))).toContain("Fora da divisão: Sanita.");
    expect(avisosDaPlanta(sala([pc({ id: "a", x: 100, y: 80, nome: "A" }), pc({ id: "b", x: 120, y: 90, nome: "B" })]))).toContain("Sobreposição: A e B.");
    const cheia = sala([pc({ id: "a", x: 10, y: 10, w: 140, h: 180 }), pc({ id: "b", x: 150, y: 10, w: 140, h: 180 })]);
    expect(ocupacao(cheia)).toBeCloseTo(0.84, 2);
    expect(avisosDaPlanta(cheia).some((m) => m.startsWith("Peças a mais"))).toBe(true);
  });
});

describe("mover no 3D (moverPara: o ponto do chão em metros, com as regras da planta)", () => {
  it("a peça de chão vai para o ponto e fica dentro da divisão", () => {
    const r = moverPara(sala(), pc(), 1.5, 1.0);
    expect(r.ok && centroPeca(r.peca)).toEqual({ x: 150, y: 100 });
    const fora = moverPara(sala(), pc(), 5, 5);
    expect(fora.ok && pecaDentro(poly, fora.peca)).toBe(true);
  });
  it("perto de uma parede, a peça de chão vira as costas à parede", () => {
    const r = moverPara(sala(), pc({ rot: 90 }), 2.8, 1.0);
    expect(r.ok && r.peca.rot).toBe(270);
  });
  it("a peça de parede só corre ao longo da parede, passa o canto e mantém (ou muda) a altura ao chão", () => {
    const parede = pc({ mont: "parede", alt: 120, h: 10 });
    const r = moverPara(sala(), parede, 1.0, 0.6);
    expect(r.ok && [centroPeca(r.peca).y, r.peca.alt]).toEqual([5, 120]);
    const canto = moverPara(sala(), parede, 2.95, 1.2);
    expect(canto.ok && [centroPeca(canto.peca).x, canto.peca.rot]).toEqual([295, 270]);
    const alto = moverPara(sala(), parede, 1.0, 0.1, 1.6);
    expect(alto.ok && alto.peca.alt).toBe(160);
    expect((moverPara(sala(), parede, 1.0, 0.1, -1) as { peca: PecaPlanta }).peca.alt).toBe(0);
  });
});
