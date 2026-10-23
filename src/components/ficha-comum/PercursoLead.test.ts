import { describe, expect, it } from "vitest";
import { estadosPercurso } from "./estadosPercurso";

describe("estadosPercurso", () => {
  it("uma lead em curso: os anteriores feitos, o atual, os seguintes por fazer", () => {
    expect(estadosPercurso(5, 2, null, false)).toEqual(["feito", "feito", "atual", "porFazer", "porFazer"]);
    expect(estadosPercurso(5, 0, null, false)).toEqual(["atual", "porFazer", "porFazer", "porFazer", "porFazer"]);
  });
  it("uma lead perdida: feitos até ao passo da perda, esse passo perdido e os seguintes fora de alcance", () => {
    expect(estadosPercurso(5, 2, 1, false)).toEqual(["feito", "perdido", "foraAlcance", "foraAlcance", "foraAlcance"]);
    expect(estadosPercurso(5, 3, 3, false)).toEqual(["feito", "feito", "feito", "perdido", "foraAlcance"]);
    expect(estadosPercurso(5, 0, 0, false)).toEqual(["perdido", "foraAlcance", "foraAlcance", "foraAlcance", "foraAlcance"]);
  });
  it("um cliente tem os 5 passos feitos, sem passo atual", () => {
    expect(estadosPercurso(5, 4, null, true)).toEqual(["feito", "feito", "feito", "feito", "feito"]);
  });
  it("nunca há mais de um passo atual", () => {
    expect(estadosPercurso(5, 3, null, false).filter((e) => e === "atual")).toHaveLength(1);
    expect(estadosPercurso(5, 3, 2, false).filter((e) => e === "atual")).toHaveLength(0);
  });
});
