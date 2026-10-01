import { describe, expect, it } from "vitest";
import { compararTempo, minutosParaSegundos, segundosParaMinutos } from "../tempo";
import { FUNCOES, funcaoPeloMenos, nivelFuncao } from "../tipos";

describe("minutos ↔ segundos (o formulário da checklist)", () => {
  it("lê minutos à portuguesa", () => {
    expect(minutosParaSegundos("15")).toBe(900);
    expect(minutosParaSegundos("2,5")).toBe(150);
    expect(minutosParaSegundos(" 1.5 ")).toBe(90);
  });

  it("vazio, negativo ou lixo é 'sem estimativa', não um número inventado", () => {
    expect(minutosParaSegundos("")).toBe(0);
    expect(minutosParaSegundos("-5")).toBe(0);
    expect(minutosParaSegundos("abc")).toBe(0);
  });

  it("devolve o que estava gravado para o formulário", () => {
    expect(segundosParaMinutos(900)).toBe("15");
    expect(segundosParaMinutos(150)).toBe("2,5");
    expect(segundosParaMinutos(0)).toBe("");
  });
});

describe("compararTempo — real contra estimado", () => {
  it("sem estimativa não há desvio", () => {
    expect(compararTempo(0, 300)).toEqual({
      estimado: 0, real: 300, desvio: null, situacao: "sem_estimativa",
    });
  });

  it("dentro do estimado, com 10% de folga", () => {
    expect(compararTempo(600, 650).situacao).toBe("dentro");
    expect(compararTempo(600, 660).situacao).toBe("dentro");
    expect(compararTempo(600, 650).desvio).toBe(50);
  });

  it("acima da folga é 'acima'", () => {
    expect(compararTempo(600, 661).situacao).toBe("acima");
  });

  it("tempo negativo (relógio estranho) conta zero", () => {
    expect(compararTempo(600, -20).real).toBe(0);
  });
});


describe("hierarquia de funções", () => {
  it("o supervisor fica entre o gestor e o operador", () => {
    expect(FUNCOES).toEqual(["admin", "gestor", "supervisor", "operador", "tecnico"]);
    expect(nivelFuncao("supervisor")).toBe(2);
    expect(funcaoPeloMenos("supervisor", "operador")).toBe(true);
    expect(funcaoPeloMenos("supervisor", "gestor")).toBe(false);
  });
});
