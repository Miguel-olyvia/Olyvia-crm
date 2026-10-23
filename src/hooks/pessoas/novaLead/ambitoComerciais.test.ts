import { describe, expect, it } from "vitest";
import { filtrarComerciaisPorAmbito } from "./ambitoComerciais";

const TODOS = [{ id: "eu" }, { id: "colega" }, { id: "outro" }];

describe("filtrarComerciaisPorAmbito (o âmbito leads.view de quem cria)", () => {
  it("ORG vê todos", () => {
    expect(filtrarComerciaisPorAmbito(TODOS, "ORG", "eu", ["colega"])).toEqual(TODOS);
  });

  it("TEAM vê quem cria e a equipa", () => {
    expect(filtrarComerciaisPorAmbito(TODOS, "TEAM", "eu", ["colega"]).map((u) => u.id)).toEqual(["eu", "colega"]);
  });

  it("OWNED e NONE vêem só quem cria, e a equipa nunca alarga a visão", () => {
    for (const ambito of ["OWNED", "NONE"] as const) {
      expect(filtrarComerciaisPorAmbito(TODOS, ambito, "eu", ["colega"]).map((u) => u.id)).toEqual(["eu"]);
    }
  });

  it("sem utilizador conhecido, OWNED não vê ninguém; ORG devolve uma cópia", () => {
    expect(filtrarComerciaisPorAmbito(TODOS, "OWNED", null)).toEqual([]);
    const copia = filtrarComerciaisPorAmbito(TODOS, "ORG", null);
    expect(copia).not.toBe(TODOS);
  });
});
