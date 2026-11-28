import { describe, expect, it, beforeEach } from "vitest";
import { arrumarCasa, chaveDaArea, encaixar, formaDaArea, lerLayout, limitesCasa, rodarMais, areaTotal } from "./casaLayout";
import { areasPorJuntar, comDivisao, divisoesDoNegocio, estudioDaArea, nomeDeArea, tipoDaArea } from "../divisoesNegocio";
import { areaDoEndereco, chaveDoEstudio, guardarProjetoLocal, lerProjetoLocal, projetoVazio } from "@/pages/prototipo-estudio/projetoGuardado";
import { lerVolta, devolverAoNegocio } from "@/pages/prototipo-estudio/daVisita";
import type { Planta } from "../planta";

const retangulo = (w: number, h: number): Planta => ({ o: { x: 0, y: 0 }, paredes: [{ c: w, r: "E" }, { c: h, r: "S" }, { c: w, r: "W" }, { c: h, r: "N" }], pecas: [] });

describe("casa toda: o lugar das áreas (28/11)", () => {
  it("as áreas sem lugar entram em fila, à direita das que o têm", () => {
    const c = arrumarCasa([{ nome: "Sala", planta: retangulo(500, 400) }, { nome: "Cozinha", planta: retangulo(300, 250) }], {});
    expect(c[0].lugar).toEqual({ x: 0, y: 0 });
    expect(c[1].lugar.x).toBe(560);
    expect(c[0].m2).toBe(20);
    const c2 = arrumarCasa([{ nome: "Sala", planta: retangulo(500, 400) }, { nome: "Cozinha", planta: retangulo(300, 250) }], { sala: { x: 100, y: 50 } });
    expect(c2[1].lugar.x).toBe(660);
  });
  it("rodar 90° troca a largura e a altura e fica encostada a (0,0)", () => {
    const f = formaDaArea(retangulo(500, 300), 90);
    expect([f.w, f.h]).toEqual([300, 500]);
    expect(Math.min(...f.pts.map((q) => q.x))).toBe(0);
    expect(Math.min(...f.pts.map((q) => q.y))).toBe(0);
    expect(rodarMais(270)).toBe(0);
    expect(rodarMais(undefined)).toBe(90);
  });
  it("uma área por desenhar é uma caixa de 2 × 2 m", () => {
    expect(formaDaArea(null)).toMatchObject({ w: 200, h: 200, fecha: false });
  });
  it("ao largar encaixa na parede da outra (até 30 cm), senão vai de 5 em 5 cm", () => {
    const sala = { x: 0, y: 0, w: 500, h: 400 };
    expect(encaixar({ x: 517, y: 12, w: 300, h: 250 }, [sala])).toEqual({ x: 500, y: 0 });
    expect(encaixar({ x: 603, y: 102, w: 300, h: 250 }, [sala])).toEqual({ x: 605, y: 100 });
    // largada por cima da sala: sai pelo lado mais perto, encostada por fora
    expect(encaixar({ x: 0, y: 300, w: 150, h: 160 }, [sala])).toEqual({ x: 0, y: 400 });
    expect(encaixar({ x: 420, y: 100, w: 150, h: 160 }, [sala])).toEqual({ x: 500, y: 100 });
  });
  it("lê o layout com cuidado e soma a área", () => {
    expect(lerLayout('{"sala":{"x":10.4,"y":"a"},"coz":{"x":1,"y":2,"r":90},"wc":{"x":1,"y":2,"r":45}}')).toEqual({ coz: { x: 1, y: 2, r: 90 }, wc: { x: 1, y: 2 } });
    expect(lerLayout("lixo")).toEqual({});
    expect(chaveDaArea("Casa de Banho  Suíte")).toBe("casa de banho suite");
    expect(areaTotal([{ m2: 20 }, { m2: null }, { m2: 7.5 }])).toBe(27.5);
    expect(limitesCasa([{ forma: formaDaArea(retangulo(100, 100)), lugar: { x: -50, y: 20 } }])).toEqual({ x: -50, y: 20, w: 100, h: 100 });
  });
});

describe("casa toda: as áreas do negócio", () => {
  it("junta áreas com nome escrito; as casas de banho repetem-se com número", () => {
    const f = { diag_tipo_area: "Casa de banho, Cozinha" };
    expect(comDivisao(f, "Casa de banho suite")).toBe("Casa de banho, Cozinha, Casa de banho suite");
    expect(comDivisao(f, "cozinha")).toBe("Casa de banho, Cozinha");
    expect(nomeDeArea(" Sala, de jantar ")).toBe("Sala de jantar");
    const ps = areasPorJuntar(f);
    expect(ps).toContain("Casa de banho 2");
    expect(ps).toContain("Sala");
    expect(ps).not.toContain("Cozinha");
    const ds = divisoesDoNegocio({ diag_tipo_area: "Sala, Casa de banho suite" });
    expect(ds.map((x) => x.prefixo)).toEqual(["", "div_casadebanhosuite_"]);
    expect(tipoDaArea("Casa de banho suite")).toBe("casa_banho");
    expect(estudioDaArea("Copa")).toBe("Cozinha");
    expect(estudioDaArea("Sala")).toBe("Casa de banho");
  });
});

describe("casa toda: cada área tem o seu Estúdio neste browser", () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
  it("a chave da área é outra; a principal fica na de sempre", () => {
    expect(chaveDoEstudio(7)).toBe("olyvia.estudio.v1.7");
    expect(chaveDoEstudio(7, "div_coz_")).toBe("olyvia.estudio.v1.7.div_coz_");
    const p = { ...projetoVazio(), negocio: 7, area: { nome: "Cozinha", prefixo: "div_coz_" } };
    guardarProjetoLocal(p);
    expect(lerProjetoLocal(7, "div_coz_")?.area?.nome).toBe("Cozinha");
    expect(lerProjetoLocal(7)).toBeNull();
  });
  it("o endereço diz a área; a volta só serve à mesma área", () => {
    expect(areaDoEndereco("?negocio=7&area=div_coz_")).toBe("div_coz_");
    expect(areaDoEndereco("?negocio=7&area=../x")).toBe("");
    devolverAoNegocio({ ...projetoVazio(), negocio: 7, area: { nome: "Cozinha", prefixo: "div_coz_" } });
    expect(lerVolta(7)).toBeNull();
    expect(lerVolta(7, "div_coz_")?.area).toBe("div_coz_");
  });
});
