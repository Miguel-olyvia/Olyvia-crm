// 6/11: os produtos escolhidos sugerem os serviços, cada um com o porquê.
import { describe, expect, it } from "vitest";
import { PLANTA_VAZIA, retangulo, type Planta } from "@/emylia/planta";
import type { Projeto } from "./necessidadesEstudio";
import { juntarSugestoes, recusarSugestao, sugestoesDeServicos } from "./sugestoesServicos";

const depois: Planta = {
  ...PLANTA_VAZIA, paredes: retangulo(200, 250),
  pecas: [{ id: "b", tipo: "base", x: 0, y: 0, w: 120, h: 70 }, { id: "m", tipo: "movel", x: 0, y: 100, w: 80, h: 46 }, { id: "e", tipo: "espelho", x: 0, y: 96, w: 80, h: 4 }],
};
const base = (extra: Partial<Projeto> = {}): Projeto => ({
  antes: PLANTA_VAZIA, depois, escolhas: {}, acompanha: {}, alturas: { peDireito: 260, tetoFalso: null }, estilo: { cores: [], porCategoria: {} }, ajustes: {}, ...extra,
});
const ids = (p: Projeto) => sugestoesDeServicos(p).map((x) => x.sv.id);

describe("os serviços sugeridos pelos produtos", () => {
  it("sem produtos escolhidos, nada", () => expect(sugestoesDeServicos(base())).toEqual([]));
  it("a base pede impermeabilização e nicho, com o porquê e a zona do duche", () => {
    const s = sugestoesDeServicos(base({ escolhas: { b: "bas-ard-p" } }));
    const imp = s.find((x) => x.sv.id === "sv-imperm")!;
    expect(imp.porque[0]).toMatch(/^Base Ardósia por medida: /);
    expect(imp.q).toBeCloseTo(0.84 + 3.8, 2);
    expect(s.map((x) => x.sv.id)).toEqual(expect.arrayContaining(["sv-nicho", "sv-ventilador", "sv-limpeza"]));
  });
  it("uma tomada por aparelho; dois aparelhos elétricos pedem o circuito novo; espelho sem luz pede o aplique", () => {
    const s = sugestoesDeServicos(base({ escolhas: { m: "mov-axis-80", e: "esp-led-80" }, porColocar: [{ id: "t", tipo: "toalheiro", produto: "toa-ele-p" }] }));
    expect(s.find((x) => x.sv.id === "sv-tomada")).toMatchObject({ q: 3 });
    expect(s.find((x) => x.sv.id === "sv-tomada")!.porque).toHaveLength(3);
    expect(ids(base({ escolhas: { m: "mov-axis-80", e: "esp-led-80" }, porColocar: [{ id: "t", tipo: "toalheiro", produto: "toa-ele-p" }] }))).toContain("sv-eletrica");
    expect(ids(base({ escolhas: { e: "esp-red" } }))).toContain("sv-aplique");
    expect(ids(base({ escolhas: { e: "esp-red" } }))).not.toContain("sv-tomada");
  });
  it("revestimento pede reboco; só pavimento pede rodapé; teto falso pede pintura; com janela não há ventilador", () => {
    expect(ids(base({ revestimento: "rev-tela-c", pavimento: "pav-tela-a" }))).toEqual(expect.arrayContaining(["sv-reboco"]));
    expect(ids(base({ revestimento: "rev-tela-c", pavimento: "pav-tela-a" }))).not.toContain("sv-rodape");
    expect(ids(base({ pavimento: "pav-tela-a" }))).toContain("sv-rodape");
    expect(ids(base({ pavimento: "pav-tela-a", alturas: { peDireito: 260, tetoFalso: 240 } }))).toContain("sv-pintura-teto");
    const comJanela = { ...depois, pecas: [...depois.pecas, { id: "j", tipo: "janela" as const, x: 50, y: 0, w: 100, h: 8 }] };
    expect(ids(base({ depois: comJanela, pavimento: "pav-tela-a" }))).not.toContain("sv-ventilador");
  });
  it("juntar tira das sugestões; «agora não» também, e não volta", () => {
    let p = base({ escolhas: { b: "bas-ard-p" } });
    p = juntarSugestoes(p, sugestoesDeServicos(p).filter((x) => x.sv.id === "sv-imperm"));
    expect(p.servicos?.[0]).toMatchObject({ id: "sv-imperm" });
    expect(ids(p)).not.toContain("sv-imperm");
    p = recusarSugestao(p, "sv-nicho");
    expect(ids(p)).not.toContain("sv-nicho");
    p = juntarSugestoes(p, sugestoesDeServicos(p));
    expect(ids(p)).toEqual([]);
  });
});

describe("a cozinha (6/11)", () => {
  const cozinha: Planta = {
    ...PLANTA_VAZIA, paredes: retangulo(300, 250),
    pecas: [{ id: "b1", tipo: "bancada", x: 0, y: 0, w: 240, h: 60 }, { id: "l", tipo: "lava", x: 20, y: 5, w: 80, h: 50 }, { id: "pl", tipo: "placa", x: 150, y: 5, w: 60, h: 52 },
      { id: "ex", tipo: "exaustor", x: 150, y: 0, w: 60, h: 45 }, { id: "ar", tipo: "armario", x: 240, y: 0, w: 60, h: 60 }, { id: "mq", tipo: "maquina", x: 100, y: 0, w: 60, h: 60 }],
  };
  const p = base({ divisao: "Cozinha", depois: cozinha, escolhas: { b1: "ban-quartzo-b", l: "lav-inox", pl: "pla-inducao-60", ex: "exa-inox-60", ar: "arm-branco", mq: "maq-encastrar" } });
  it("os módulos, os recortes, o circuito da placa, a conduta e a máquina; com exaustor, sem ventilador", () => {
    const s = sugestoesDeServicos(p);
    const q = (id: string) => s.find((x) => x.sv.id === id)?.q;
    expect(q("sv-montagem-cozinha")).toBe(5); // 240 cm de bancada = 4 módulos, mais o armário alto
    expect(q("sv-recortes")).toBe(2);
    expect(q("sv-circuito-placa")).toBe(1);
    expect(q("sv-conduta")).toBe(1);
    expect(q("sv-ligacao-maquina")).toBe(1);
    expect(s.map((x) => x.sv.id)).not.toContain("sv-ventilador");
    expect(s.find((x) => x.sv.id === "sv-limpeza")?.porque[0]).toMatch(/cozinha/);
  });
});
