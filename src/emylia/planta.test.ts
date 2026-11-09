// 5/11 (Rúben, a visita real): a planta da divisão em vez do croqui em papel. Desenha-se com o dedo (retas com a medida por cima) e as
// paredes à volta dão os m² do chão e das paredes.
import { describe, expect, it } from "vitest";
import {
  areaChaoM2, areaParedesM2, cantos, deViragens, emL, faltaFechar, gravarPlanta, juntarParede, juntarPeca, lerPlanta, mudarComprimento,
  encaixar, etiquetasSemSobrepor, moverParede, mudarComprimentoFechada, paredeDoTraco, peDireitoDoCampo, perimetroM, plantaDaFolha, retangulo, type Planta,
} from "./planta";

describe("planta: as contas", () => {
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
    const p = mudarComprimento(retangulo(200, 100), 0, 250);
    expect(faltaFechar(p)).toBe(50);
    expect(areaChaoM2(p)).toBeNull();
  });

  it("paredes: perímetro × pé-direito, menos a porta (2 m de altura) e a janela (1 m)", () => {
    const base: Planta = { o: { x: 0, y: 0 }, paredes: retangulo(200, 150), pecas: [] };
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
});

describe("planta: desenhar com o dedo", () => {
  it("o traço sai reto, no eixo maior, de 5 em 5 cm; um toque não é parede", () => {
    expect(paredeDoTraco({ x: 0, y: 0 }, { x: 233, y: 12 })).toEqual({ c: 235, r: "E" });
    expect(paredeDoTraco({ x: 100, y: 100 }, { x: 96, y: 278 })).toEqual({ c: 180, r: "S" });
    expect(paredeDoTraco({ x: 100, y: 100 }, { x: 20, y: 110 })).toEqual({ c: 80, r: "W" });
    expect(paredeDoTraco({ x: 0, y: 0 }, { x: 4, y: 3 })).toBeNull();
  });

  it("perto do canto de partida, no mesmo eixo, acaba nele e a planta fecha", () => {
    const inicio = { x: 0, y: 0 };
    let p = juntarParede([], paredeDoTraco(inicio, { x: 200, y: 0 })!);
    p = juntarParede(p, paredeDoTraco({ x: 200, y: 0 }, { x: 200, y: 150 })!);
    p = juntarParede(p, paredeDoTraco({ x: 200, y: 150 }, { x: 0, y: 150 })!);
    // o dedo parou 15 cm antes do canto de partida
    p = juntarParede(p, paredeDoTraco({ x: 0, y: 150 }, { x: 0, y: 15 }, inicio)!);
    expect(faltaFechar(p)).toBe(0);
    expect(areaChaoM2(p)).toBe(3);
  });

  it("duas retas seguidas no mesmo sentido são a mesma parede", () => {
    expect(juntarParede([{ c: 100, r: "E" }], { c: 50, r: "E" })).toEqual([{ c: 150, r: "E" }]);
    expect(juntarParede([{ c: 100, r: "E" }], { c: 50, r: "S" })).toEqual([{ c: 100, r: "E" }, { c: 50, r: "S" }]);
  });

  it("a folha lida dá viragens: a 1.ª parede vai para a direita e cada viragem muda o rumo", () => {
    expect(deViragens([{ c: 2, vira: "dir" }, { c: 1, vira: "dir" }, { c: 2, vira: "dir" }, { c: 1, vira: "dir" }])).toEqual(retangulo(2, 1));
    const p = plantaDaFolha({ paredes: [{ c: 234, vira: "dir" }, { c: 177, vira: "dir" }, { c: 234, vira: "dir" }, { c: 177, vira: "dir" }], pecas: [{ tipo: "sanita" }, { tipo: "foguetão" }], confianca: 0.8 });
    expect(areaChaoM2(p.paredes)).toBe(4.14);
    expect(p.pecas.map((x) => x.tipo)).toEqual(["sanita"]);
  });
});

describe("planta: gravar e ler", () => {
  it("grava e lê; lê a forma antiga (viragens); o que não se percebe não rebenta", () => {
    const p = juntarPeca({ o: { x: 50, y: 50 }, paredes: retangulo(234, 177), pecas: [] }, "base", "b1");
    expect(lerPlanta(gravarPlanta(p))).toEqual(p);
    expect(lerPlanta(JSON.stringify({ paredes: [{ c: 10, vira: "dir" }, { c: 5, vira: "dir" }] }))?.paredes).toEqual([{ c: 10, r: "E" }, { c: 5, r: "S" }]);
    expect(lerPlanta("não é json")).toBeNull();
    expect(lerPlanta(JSON.stringify({ paredes: retangulo(10, 10), pecas: [{ id: "x", tipo: "foguetão", x: 0, y: 0, w: 1, h: 1 }] }))?.pecas).toEqual([]);
  });

  it("uma peça nova fica com o centro no ponto onde se largou, de 5 em 5 cm", () => {
    const p = juntarPeca({ o: { x: 0, y: 0 }, paredes: retangulo(200, 150), pecas: [] }, "sanita", "s", { x: 51, y: 42 });
    expect(p.pecas[0]).toEqual({ id: "s", tipo: "sanita", w: 36, h: 55, x: 35, y: 15 });
  });
});

describe("planta: mexer numa parede (5/11: «alterar o seu comprimento e posição»)", () => {
  const ret = { o: { x: 0, y: 0 }, paredes: retangulo(200, 150) };
  it("mover a parede da direita 30 cm para fora: as de cima e de baixo esticam, e continua fechada", () => {
    const r = moverParede(ret, 1, { x: 30, y: 7 })!; // o y não conta: a parede é vertical
    expect(r.paredes.map((w) => w.c)).toEqual([230, 150, 230, 150]);
    expect(faltaFechar(r.paredes)).toBe(0);
  });
  it("mover a primeira parede mexe o ponto de partida", () => {
    const r = moverParede(ret, 0, { x: 0, y: 20 })!;
    expect(r.o).toEqual({ x: 0, y: 20 });
    expect(r.paredes.map((w) => w.c)).toEqual([200, 130, 200, 130]);
    expect(faltaFechar(r.paredes)).toBe(0);
  });
  it("não deixa uma vizinha ficar negativa", () => {
    expect(moverParede(ret, 1, { x: -250, y: 0 })).toBeNull();
  });
  it("mudar o comprimento numa planta fechada: a parede seguinte anda e a planta não abre", () => {
    const r = mudarComprimentoFechada(ret, 0, 250)!;
    expect(r.paredes.map((w) => w.c)).toEqual([250, 150, 250, 150]);
    expect(faltaFechar(r.paredes)).toBe(0);
    const l = mudarComprimentoFechada({ o: { x: 0, y: 0 }, paredes: emL(234, 226, 63, 74) }, 3, 100)!;
    expect(faltaFechar(l.paredes)).toBe(0);
    expect(l.paredes[3].c).toBe(100);
  });
  it("numa planta ainda aberta, muda só a parede", () => {
    const aberta = { o: { x: 0, y: 0 }, paredes: [{ c: 100, r: "E" as const }, { c: 50, r: "S" as const }] };
    expect(mudarComprimentoFechada(aberta, 0, 120)!.paredes).toEqual([{ c: 120, r: "E" }, { c: 50, r: "S" }]);
  });
});

describe("planta: as medidas não se sobrepõem (5/11)", () => {
  const sobrepoem = (cs: { x: number; y: number }[], larg: number, alt: number) =>
    cs.some((a, i) => cs.some((b, j) => j > i && Math.abs(a.x - b.x) < larg && Math.abs(a.y - b.y) < alt));
  it("a planta com o recorte estreito da captura: nenhuma medida tapa outra", () => {
    // 230 para a direita, 175 para baixo, 230 para a esquerda, 30 para cima, 60 para a direita, 70 para cima, 60 para a esquerda, 75 para cima
    const paredes = [
      { c: 230, r: "E" as const }, { c: 175, r: "S" as const }, { c: 230, r: "W" as const }, { c: 30, r: "N" as const },
      { c: 60, r: "E" as const }, { c: 70, r: "N" as const }, { c: 60, r: "W" as const }, { c: 75, r: "N" as const },
    ];
    expect(faltaFechar(paredes)).toBe(0);
    const larg = 34, alt = 12;
    const cs = etiquetasSemSobrepor(paredes, { x: 0, y: 0 }, larg, alt);
    expect(cs).toHaveLength(8);
    expect(sobrepoem(cs, larg, alt)).toBe(false);
  });
  it("num retângulo, cada medida fica por fora da sua parede, a meio", () => {
    const cs = etiquetasSemSobrepor(retangulo(200, 150), { x: 0, y: 0 }, 30, 10);
    expect(cs[0].x).toBe(100); expect(cs[0].y).toBeLessThan(0);
    expect(cs[1].x).toBeGreaterThan(200); expect(cs[1].y).toBe(75);
    expect(cs[2].y).toBeGreaterThan(150);
    expect(cs[3].x).toBeLessThan(0);
  });
});

describe("planta: trocar o produto não tira a peça do sítio (5/11)", () => {
  const sala = { o: { x: 0, y: 0 }, paredes: retangulo(234, 177) };
  it("encostada à parede da direita: fica encostada, com a frente ao longo da parede e o mesmo meio", () => {
    const sanita = { id: "s", tipo: "sanita" as const, x: 179, y: 100, w: 55, h: 36 }; // 55 de fundo, encostada à direita (x = 234)
    const r = encaixar(sanita, 36, 52, sala);
    expect(r).toMatchObject({ w: 52, h: 36, x: 234 - 52 });
    expect(r.y + r.h / 2).toBe(118);
  });
  it("encostada à parede de cima: a frente na horizontal, o lado de cima no mesmo sítio", () => {
    const base = { id: "b", tipo: "base" as const, x: 0, y: 0, w: 120, h: 70 };
    expect(encaixar(base, 120, 80, sala)).toMatchObject({ x: 0, y: 0, w: 120, h: 80 });
  });
  it("solta no meio: o mesmo centro e a mesma orientação", () => {
    const movel = { id: "m", tipo: "movel" as const, x: 100, y: 80, w: 80, h: 45 };
    const r = encaixar(movel, 60, 46, sala);
    expect(r.x + r.w / 2).toBe(140); expect(r.w).toBe(60);
  });
});

// 9/11 (Rúben, a visita real: paredes diagonais e desenhar no telemóvel)
import { cortarCanto as cortarCanto9, fecharPlanta as fecharPlanta9, juntarParede as juntarParede9, paredeDoTraco as traco9, faltaFechar as falta9, areaChaoM2 as area9, moverParede as mover9 } from "./planta";
describe("paredes a 45° e fechar (9/11)", () => {
  it("um traço claramente em diagonal é uma parede a 45°; um pouco torto continua reto", () => {
    expect(traco9({ x: 0, y: 0 }, { x: 100, y: 100 })).toEqual({ c: 140, r: "SE" });
    expect(traco9({ x: 0, y: 0 }, { x: 100, y: 30 })?.r).toBe("E");
    expect(traco9({ x: 0, y: 0 }, { x: -80, y: -90 })?.r).toBe("NW");
  });
  it("o dedo passou do canto e voltou: desconta-se em vez de juntar uma parede para trás", () => {
    expect(juntarParede9([{ c: 100, r: "N" }, { c: 40, r: "E" }], { c: 25, r: "W" })).toEqual([{ c: 100, r: "N" }, { c: 15, r: "E" }]);
    expect(juntarParede9([{ c: 100, r: "N" }, { c: 40, r: "E" }], { c: 40, r: "W" })).toEqual([{ c: 100, r: "N" }]);
  });
  it("fechar a planta: uma parede, duas a direito, ou com um canto a 45°", () => {
    const o = { x: 0, y: 0 };
    const reto = fecharPlanta9({ o, paredes: [{ c: 200, r: "E" }, { c: 150, r: "S" }, { c: 120, r: "W" }] });
    expect(falta9(reto.paredes)).toBe(0);
    expect(reto.paredes.slice(2)).toEqual([{ c: 200, r: "W" }, { c: 150, r: "N" }]); // a última continua até fechar o retângulo
    const diag = fecharPlanta9({ o, paredes: [{ c: 200, r: "E" }, { c: 150, r: "S" }, { c: 120, r: "W" }] }, "diagonal");
    expect(falta9(diag.paredes)).toBeLessThanOrEqual(1);
    expect(diag.paredes.map((w) => w.r)).toContain("NW");
  });
  it("cortar um canto: as duas paredes encurtam, entra a diagonal, a área perde o triângulo", () => {
    const r = cortarCanto9({ o: { x: 0, y: 0 }, paredes: [{ c: 200, r: "E" }, { c: 100, r: "S" }, { c: 200, r: "W" }, { c: 100, r: "N" }] }, 0, 30)!;
    expect(falta9(r.paredes)).toBeLessThanOrEqual(1);
    expect(r.o).toEqual({ x: 30, y: 0 });
    expect(area9(r.paredes)).toBe(1.96); // 2 m² menos 0,045
  });
  it("arrastar uma parede a 45°: as vizinhas acompanham e a planta continua fechada", () => {
    const p = cortarCanto9({ o: { x: 0, y: 0 }, paredes: [{ c: 200, r: "E" }, { c: 100, r: "S" }, { c: 200, r: "W" }, { c: 100, r: "N" }] }, 1, 40)!;
    const i = p.paredes.findIndex((w) => w.r === "SE");
    const m = mover9(p, i, { x: -10, y: 10 })!;
    expect(falta9(m.paredes)).toBeLessThanOrEqual(1);
  });
});
