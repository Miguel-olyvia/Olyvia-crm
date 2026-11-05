// 5/11 (Rúben): as necessidades saem da planta do antes e do depois; o comercial ajusta.
import { describe, expect, it } from "vitest";
import { retangulo, type Planta } from "@/emylia/planta";
import { combina, melhorPara, produtosDe, type Estilo } from "./catalogoFake";
import { TABELA, aplicarEstilo, colocar, decidir, decisaoDe, estadoDaPeca, juntarPorColocar, juntarServico, mudaramDeSitio, mudarQtdServico, necessidades, qtdSugerida, sairam, servicosRecomendados, tirarServico, totais, type Projeto } from "./necessidadesEstudio";
import { servico } from "./catalogoFake";

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

describe("o passo «Estilo»: decidir cada peça e juntar produtos (5/11)", () => {
  it("trocar a sanita fica com o recomendado; tirar o bidé tira-o do depois; ficar volta ao que era", () => {
    let p = projeto();
    p = decidir(p, "san", "troca", "san-nexo-s");
    expect(decisaoDe(p, "san")).toBe("troca");
    expect(p.escolhas.san).toBe("san-nexo-s");
    p = decidir(p, "bid", "tira");
    expect(decisaoDe(p, "bid")).toBe("tira");
    expect(sairam(p).map((x) => x.id)).toEqual(["bid"]);
    p = decidir(p, "bid", "fica");
    expect(decisaoDe(p, "bid")).toBe("fica");
    p = decidir(p, "san", "fica");
    expect(p.escolhas.san).toBeUndefined();
  });

  it("um produto novo fica por colocar e já conta no orçamento; posto na planta, as linhas são as mesmas", () => {
    let p = juntarPorColocar(projeto(), { tipo: "base", produto: "bas-ard-c", acompanha: { resguardo: "res-meio-p" } }, "b1");
    const antes = necessidades(p);
    expect(antes.find((l) => l.id === "prod-b1")).toMatchObject({ n: "Base Ardósia por medida, Cinza", porque: "Escolhido no estilo; falta pô-lo na planta." });
    expect(antes.some((l) => l.id === "acomp-b1-resguardo")).toBe(true);
    p = colocar(p, "b1", { x: 60, y: 35 });
    expect(p.porColocar).toEqual([]);
    expect(p.depois.pecas.find((x) => x.id === "b1")).toMatchObject({ tipo: "base", w: 120, h: 70, x: 0, y: 0 });
    expect(p.escolhas.b1).toBe("bas-ard-c");
    expect(totais(necessidades(p)).semIva).toBe(totais(antes).semIva);
  });
});

describe("os serviços (5/11: «e incluir também os serviços»)", () => {
  it("a quantidade sugerida sai da planta: o teto pelo chão, o rodapé pelo perímetro", () => {
    const p = projeto();
    expect(qtdSugerida(servico("sv-pintura-teto")!, p)).toBe(4.14);
    expect(qtdSugerida(servico("sv-rodape")!, p)).toBe(8.22);
    expect(qtdSugerida(servico("sv-estores")!, p)).toBe(1);
  });
  it("recomenda os que têm a ver com as peças: com uma base, a impermeabilização e o nicho", () => {
    const p = juntarPorColocar(projeto(), { tipo: "base" }, "b1");
    expect(servicosRecomendados(p).map((x) => x.id)).toEqual(expect.arrayContaining(["sv-imperm", "sv-nicho"]));
    expect(servicosRecomendados(projeto()).map((x) => x.id)).not.toContain("sv-imperm");
  });
  it("juntar, mudar a quantidade e tirar um serviço, e o orçamento acompanha", () => {
    let p = juntarServico(projeto(), "sv-pintura-teto");
    expect(necessidades(p).find((l) => l.id === "serv-sv-pintura-teto")).toMatchObject({ q: 4.14, total: Math.round(4.14 * 9 * 100) / 100 });
    p = mudarQtdServico(p, "sv-pintura-teto", 5);
    expect(necessidades(p).find((l) => l.id === "serv-sv-pintura-teto")?.total).toBe(45);
    expect(juntarServico(p, "sv-pintura-teto").servicos).toHaveLength(1);
    p = tirarServico(p, "sv-pintura-teto");
    expect(necessidades(p).some((l) => l.id === "serv-sv-pintura-teto")).toBe(false);
  });
});
