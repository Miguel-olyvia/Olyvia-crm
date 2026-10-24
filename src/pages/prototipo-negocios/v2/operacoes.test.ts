// As regras das Operações da V2: validar e rejeitar tarefas, atrasos, aprovar o plano, previsto contra real e o Hoje do supervisor.
import { describe, expect, it } from "vitest";
import { partes, seed, type Negocio } from "../motor";
import {
  OPCOES_INICIO, avisarCliente, datasTarefa, desvio, diasAtraso, erroRejeicao, errosAtraso, estadoTarefa, faltaAprovar, fracaoFeita, hojeSupervisor,
  isoDia, porValidar, previstoReal, regVazio, registarAtraso, rejeitarTarefa, validarTarefa, validarTodas,
} from "./operacoes";
import { REAL_EXEMPLO, REAL_POR_DEFEITO, fatoresDe } from "./realExemplo";
import { regObra, guardarObra } from "./estadoV2";

const deal = (S: ReturnType<typeof seed>, id: number): Negocio => S.deals.find((d) => d.id === id)!;

describe("tarefas: por fazer, por validar, validada, rejeitada", () => {
  it("na obra em curso da Marta (dia 3) as duas primeiras estão feitas e por validar", () => {
    const p = deal(seed(), 1022).obra.plano!, r = regVazio();
    expect(p.tasks.map((_, i) => estadoTarefa(p, r, i))).toEqual(["por validar", "por validar", "por fazer", "por fazer"]);
    expect(porValidar(p, r)).toEqual([0, 1]);
  });
  it("validar uma, rejeitar outra com motivo, validar todas não mexe nas rejeitadas", () => {
    const p = deal(seed(), 1022).obra.plano!;
    let r = rejeitarTarefa(regVazio(), 1, "  Falta limpar ");
    expect(estadoTarefa(p, r, 1)).toBe("rejeitada");
    expect(r.rejeitadas[1]).toBe("Falta limpar");
    r = validarTodas(p, r);
    expect(estadoTarefa(p, r, 0)).toBe("validada");
    expect(estadoTarefa(p, r, 1)).toBe("rejeitada");
    r = validarTarefa(r, 1); // o técnico corrigiu
    expect(estadoTarefa(p, r, 1)).toBe("validada");
    expect(r.rejeitadas[1]).toBeUndefined();
    expect(validarTarefa(r, 1).validadas.filter((x) => x === 1)).toHaveLength(1);
  });
  it("rejeitar sem motivo não faz nada e diz porquê", () => {
    const r = regVazio();
    expect(erroRejeicao("   ")).toMatch(/motivo/);
    expect(rejeitarTarefa(r, 0, " ")).toBe(r);
  });
  it("uma tarefa por fazer nunca está por validar, mesmo marcada", () => {
    const p = deal(seed(), 1022).obra.plano!;
    expect(estadoTarefa(p, validarTarefa(regVazio(), 3), 3)).toBe("por fazer");
  });
  it("as datas de uma tarefa", () => {
    const p = deal(seed(), 1022).obra.plano!;
    expect(datasTarefa(p.tasks[0])).toBe("seg 13/10");
    expect(datasTarefa(p.tasks[2])).toBe("qua 15/10 a qui 16/10");
    expect(isoDia("seg 13/10")).toBe("2026-10-13");
    expect(OPCOES_INICIO).toHaveLength(5);
  });
});

describe("atrasos", () => {
  const p = deal(seed(), 1022).obra.plano!;
  it("pede a fase, os dias e o motivo", () => {
    expect(errosAtraso({ tarefa: null, dias: 0, motivo: "", clienteAvisado: false }, p)).toHaveLength(3);
    expect(errosAtraso({ tarefa: 2, dias: 2, motivo: "Chuva", clienteAvisado: false }, p)).toEqual([]);
  });
  it("regista, conta os dias e marca o cliente avisado", () => {
    let r = registarAtraso(regVazio(), { tarefa: 2, dias: 2, motivo: "Chuva", clienteAvisado: false });
    r = registarAtraso(r, { tarefa: 3, dias: 1, motivo: "Material em falta", clienteAvisado: true });
    expect(diasAtraso(r)).toBe(3);
    r = avisarCliente(r, "a1", true);
    expect(r.atrasos.map((a) => a.clienteAvisado)).toEqual([true, true]);
  });
});

describe("aprovar o plano", () => {
  it("falta o supervisor, a data e resolver o conflito (o Sérgio está de férias)", () => {
    const S = seed(), d = deal(S, 1022), p = structuredClone(d.obra.plano!);
    p.estado = "por aprovar";
    p.tasks.forEach((t) => { if (t.sk === "Ladrilhador") t.tec = "sf"; });
    expect(faltaAprovar(p, regVazio())).toEqual(["o supervisor", "a data de início", "resolver o conflito"]);
    p.tasks.forEach((t) => { if (t.tec === "sf") t.tec = "hn"; });
    expect(faltaAprovar(p, { ...regVazio(), aprovacao: { supervisor: "Filipe", inicio: "2026-10-13" } })).toEqual([]);
  });
  it("o registo novo traz o supervisor e a data do negócio como sugestão; a obra concluída vem toda validada", () => {
    const S = seed();
    expect(regObra(S, deal(S, 1022)).aprovacao).toEqual({ supervisor: "Filipe", inicio: deal(S, 1022).f.inicio });
    const j = deal(S, 1050);
    expect(porValidar(j.obra.plano!, regObra(S, j))).toEqual([]);
    expect(regObra(S, deal(S, 1022)).atrasos[0]).toMatchObject({ exemplo: true, clienteAvisado: false });
  });
  it("o registo é por Estado: repor a demonstração (um Estado novo) recomeça", () => {
    const S = seed(), d = deal(S, 1022);
    guardarObra(S, d.id, validarTodas(d.obra.plano!, regObra(S, d)));
    expect(porValidar(d.obra.plano!, regObra(S, d))).toEqual([]);
    const S2 = seed();
    expect(porValidar(deal(S2, 1022).obra.plano!, regObra(S2, deal(S2, 1022)))).toEqual([0, 1]);
  });
});

describe("previsto contra real", () => {
  it("numa obra concluída compara tudo: o previsto é a receita (partes do orçamento) e o real usa os fatores de exemplo", () => {
    const S = seed(), d = deal(S, 1050), P = partes(d, S), R = previstoReal(d, S, fatoresDe(1050));
    expect(R.fracao).toBe(1);
    expect(R.linhas.map((l) => l.k)).toEqual(["mo", "eq", "cons", "estr"]);
    expect(R.linhas[0].prev).toBeCloseTo(P.mo, 2);
    expect(R.linhas[0].real).toBeCloseTo(P.mo * REAL_EXEMPLO[1050].mo, 2);
  });
  it("numa obra em curso só a parte feita; antes de arrancar, nada", () => {
    const S = seed(), d = deal(S, 1022);
    const fr = fracaoFeita(d.obra.plano!);
    expect(fr).toBeGreaterThan(0);
    expect(fr).toBeLessThan(1);
    expect(previstoReal(d, S, fatoresDe(1022)).linhas[0].prev).toBeCloseTo(partes(d, S).mo * fr, 2);
    d.obra.plano!.estado = "aprovado";
    expect(previstoReal(d, S, fatoresDe(1022))).toMatchObject({ fracao: 0, prev: 0, real: 0 });
  });
  it("sem a estrutura nas definições, não há linha de estrutura", () => {
    const S = seed(); S.cfg.estrutura = false;
    expect(previstoReal(deal(S, 1050), S, REAL_POR_DEFEITO).linhas.map((l) => l.k)).not.toContain("estr");
  });
  it("o desvio em texto: até 2% é dentro do previsto", () => {
    expect(desvio(100, 108)).toEqual({ pct: 8, dif: 8, sentido: "acima" });
    expect(desvio(100, 90)).toEqual({ pct: -10, dif: -10, sentido: "abaixo" });
    expect(desvio(100, 101.5).sentido).toBe("igual");
    expect(desvio(0, 0).sentido).toBe("igual");
    expect(fatoresDe(99999)).toBe(REAL_POR_DEFEITO);
  });
});

describe("o Hoje do supervisor", () => {
  it("as tarefas por validar e os atrasos das obras abertas, cada uma só uma vez", () => {
    const S = seed();
    const obras = S.deals.filter((d) => d.fase === 5 && d.obra.plano);
    const H = hojeSupervisor([...obras, ...obras], (d) => regObra(S, d)); // a mesma obra duas vezes não repete nada
    expect(H.validar.map((x) => x.titulo)).toEqual(["Demolição · Marta Lima", "Canalização · Marta Lima"]);
    expect(H.atrasos).toHaveLength(1);
    expect(H.atrasos[0].texto).toBe("1 dia · Material em falta · cliente por avisar");
    expect(new Set([...H.validar, ...H.atrasos].map((x) => x.chave)).size).toBe(3);
  });
});
