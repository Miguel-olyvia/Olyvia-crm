// 5/11 (Rúben): as necessidades saem da planta do antes e do depois; o comercial ajusta.
import { describe, expect, it } from "vitest";
import { retangulo, type Planta } from "@/emylia/planta";
import { combina, melhorPara, produtosDe, type Estilo } from "./catalogoFake";
import { TABELA, aplicarEstilo, estadoDaPeca, mudaramDeSitio, necessidades, sairam, totais, type Projeto } from "./necessidadesEstudio";

const ANTES: Planta = { o: { x: 0, y: 0 }, paredes: retangulo(234, 177), pecas: [
  { id: "ban", tipo: "banheira", x: 0, y: 0, w: 170, h: 70 },
  { id: "san", tipo: "sanita", x: 190, y: 10, w: 36, h: 55 },
  { id: "bid", tipo: "bide", x: 190, y: 80, w: 36, h: 55 },
  { id: "porta", tipo: "porta", x: 100, y: 170, w: 80, h: 8 },
] };
const ESTILO: Estilo = { cores: ["cinza", "preto"], porCategoria: { movel: ["madeira"], sanita: ["branco", "cinza"] } };
const projeto = (mudar: Partial<Projeto> = {}): Projeto => ({
  antes: ANTES, depois: { ...ANTES, pecas: ANTES.pecas.map((x) => ({ ...x })) }, escolhas: {}, acompanha: {},
  alturas: { peDireito: 260, tetoFalso: null }, estilo: ESTILO, ajustes: {}, ...mudar,
});

describe("o catálogo e o estilo", () => {
  it("o estilo do cliente filtra e ordena: o resto cinza, o móvel em madeira, a sanita branca", () => {
    expect(melhorPara("movel", ESTILO)?.cores).toContain("madeira");
    expect(melhorPara("sanita", ESTILO)?.cores).toContain("branco");
    expect(melhorPara("revestimento", ESTILO)?.cores[0]).toBe("cinza");
    expect(produtosDe("movel", ESTILO).every((p) => combina(p, ESTILO) > 0)).toBe(true);
    expect(produtosDe("movel", ESTILO, true).length).toBeGreaterThan(produtosDe("movel", ESTILO).length);
  });
});

describe("as necessidades da planta", () => {
  it("sem mudanças, não há necessidades", () => {
    expect(necessidades(projeto())).toEqual([]);
  });

  it("a banheira sai e entra uma base nova: retirar, a base por escolher, a instalação, o ponto de água, o entulho e as proteções", () => {
    const p = projeto();
    p.depois = { ...p.depois, pecas: [...p.depois.pecas.filter((x) => x.id !== "ban"), { id: "base1", tipo: "base", x: 0, y: 0, w: 120, h: 70 }] };
    expect(sairam(p).map((x) => x.id)).toEqual(["ban"]);
    const l = necessidades(p);
    expect(l.map((x) => x.id)).toEqual(["ret-ban", "prod-base1", "inst-base1", "agua-base1", "dem", "prot"]);
    expect(l.find((x) => x.id === "prod-base1")).toMatchObject({ porEscolher: true, total: 0 });
    expect(l.find((x) => x.id === "ret-ban")?.total).toBe(TABELA.retirar.banheira);
  });

  it("trocar a sanita no catálogo: retirar a antiga, o produto e a instalação do produto", () => {
    const p = projeto({ escolhas: { san: "san-nexo-s" } });
    expect(estadoDaPeca(p, p.depois.pecas[1])).toBe("troca");
    const l = necessidades(p);
    expect(l.find((x) => x.id === "prod-san")).toMatchObject({ n: "Sanita suspensa Nexo, sem aro", total: 289 });
    expect(l.find((x) => x.id === "inst-san")?.total).toBe(140);
  });

  it("uma peça que muda de sítio leva a canalização atrás", () => {
    const p = projeto();
    p.depois = { ...p.depois, pecas: p.depois.pecas.map((x) => (x.id === "san" ? { ...x, x: x.x - 100 } : x)) };
    expect(mudaramDeSitio(p).map((x) => x.id)).toEqual(["san"]);
    expect(necessidades(p).some((x) => x.id === "agua-san" && x.n === "Mudar de sítio: sanita")).toBe(true);
  });

  it("revestimento até ao teto falso e pavimento por m², com quebras; demolição, canalização nova e teto falso", () => {
    const p = projeto({ revestimento: "rev-tela-c", pavimento: "pav-tela-a", alturas: { peDireito: 260, tetoFalso: 240 } });
    const l = necessidades(p);
    const paredes = Math.round((8.22 * 2.4 - 0.8 * 2) * 100) / 100;
    expect(l.find((x) => x.id === "rev")?.q).toBe(Math.round(paredes * 1.1 * 100) / 100);
    expect(l.find((x) => x.id === "pav")?.q).toBe(Math.round(4.14 * 1.1 * 100) / 100);
    expect(l.find((x) => x.id === "teto")).toMatchObject({ n: "Teto falso a 2,4 m", q: 4.14 });
    expect(l.some((x) => x.id === "canal")).toBe(true);
  });

  it("o comercial ajusta: muda a quantidade ou tira a linha, e o total acompanha", () => {
    const base = projeto({ escolhas: { san: "san-nexo-s" } });
    const t0 = totais(necessidades(base));
    const ajustado = necessidades({ ...base, ajustes: { "inst-san": { q: 2 }, prot: { fora: true } } });
    expect(ajustado.find((x) => x.id === "inst-san")).toMatchObject({ q: 2, total: 280, ajustada: true });
    expect(totais(ajustado).semIva).toBe(t0.semIva + 140 - TABELA.protecoes);
    expect(t0.comIva).toBe(Math.round(t0.semIva * 1.23 * 100) / 100);
  });

  it("«aplicar o estilo» escolhe para as peças novas e trocadas, e para as paredes e o chão", () => {
    const p = projeto({ escolhas: { san: "san-douro-p" } }); // preta: o cliente quer a sanita branca ou cinza
    p.depois = { ...p.depois, pecas: [...p.depois.pecas, { id: "mov1", tipo: "movel", x: 0, y: 100, w: 80, h: 46 }] };
    const r = aplicarEstilo(p, (cat) => melhorPara(cat, ESTILO)?.id);
    expect(r.escolhas.mov1).toBe("mov-axis-60");
    expect(r.escolhas.san).toBe("san-ria"); // a branca mais em conta
    expect(r.escolhas.bid).toBeUndefined(); // o bidé fica como está
    expect(r.acompanha.mov1?.torneira).toBe("tor-mono-c");
    expect(r.revestimento).toBe("rev-tela-c");
  });
});
