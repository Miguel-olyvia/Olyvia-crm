// 25/11 (revisão do Estúdio da obra na 1048, casa de banho e cozinha, no dia 1): a previsão não extrapola de duas tarefas, os nomes
// repetidos dizem a divisão e os dias em que a obra fica sem ninguém aparecem como alerta.
import { describe, expect, it } from "vitest";
import type { Plano, Tarefa } from "../motor";
import { previsao } from "./previsaoObra";
import { diasSemNinguem, divisaoDaTarefa, nomeNoPlano } from "./planoVivo";

const T = (nome: string, dia: number, dur: number, extra: Partial<Tarefa> = {}): Tarefa => ({ nome, svcs: [], dia, dur, sk: "x", h: dur * 8, tec: "a", fase: 1, ...extra });
const validada = { estado: "validada" as const, horas: 8, fotos: [], envios: [{ q: "", dia: 0, quem: "x", k: "feita" as const, horas: 8 }] };
const plano = (tasks: Tarefa[], dia = 0): Plano => ({ tasks, estado: "em curso", dia, origem: "orcamento", inicio: "2027-03-01" });

describe("a previsão no início da obra", () => {
  it("ir adiantado com pouco feito não encurta o fim: fica o do plano", () => {
    // a 1.ª tarefa (4 dias) feita no dia 1: o ritmo dá mais de 100%, mas só uma parte pequena da obra está feita
    const p = plano([T("Demolição", 0, 4, { exec: validada }), ...Array.from({ length: 10 }, (_, i) => T(`T${i}`, 4 + i * 4, 4))]);
    const r = previsao(p);
    expect(r.ritmo).toBeGreaterThan(1);
    expect(r.confianca).toBe("baixa");
    expect(r.fimProvavel).toBe(r.fimPlano);
  });
  it("atrasado conta sempre", () => {
    const p = plano([T("A", 0, 4, { exec: { estado: "em curso", horas: 4, fotos: [] } }), T("B", 4, 4)], 3);
    expect(previsao(p).fimProvavel).toBeGreaterThan(previsao(p).fimPlano);
  });
});

describe("os nomes com a divisão", () => {
  it("a divisão sai do nome dos modelos de obra", () => {
    expect(divisaoDaTarefa("MO Modelo Remodelação Completa - Cozinha · eletricidade")).toBe("Cozinha");
    expect(divisaoDaTarefa("Mão de Obra Demolição de parede m2")).toBeNull();
  });
  it("com duas divisões no plano, o nome curto leva a divisão; com uma só, não", () => {
    const cb = T("MO Modelo Remodelação Completa - Casa de Banho Comum · demolição e remoção", 0, 2);
    const coz = T("MO Modelo Remodelação Completa - Cozinha · demolição e remoção", 2, 2);
    const p = plano([cb, coz]);
    expect(nomeNoPlano(p, cb)).toBe("Demolição e remoção · casa de banho comum");
    expect(nomeNoPlano(p, coz)).toBe("Demolição e remoção · cozinha");
    expect(nomeNoPlano(plano([cb]), cb)).toBe("Demolição e remoção");
  });
});

describe("os dias sem ninguém na obra", () => {
  it("a tarefa acabada mais cedo deixa um buraco até à seguinte", () => {
    // A validada no dia 0 (estava para 4 dias); B só começa no dia 8: dias 1 a 7 sem ninguém
    const p = plano([T("A", 0, 4, { exec: validada }), T("B", 8, 2)], 1);
    expect(diasSemNinguem(p)).toEqual([{ ini: 1, fim: 7, seguinte: 1 }]);
  });
  it("um dia solto não conta (só a partir de dois)", () => {
    const p = plano([T("A", 0, 2), T("B", 3, 2)], 0);
    expect(diasSemNinguem(p)).toEqual([]);
  });
});
