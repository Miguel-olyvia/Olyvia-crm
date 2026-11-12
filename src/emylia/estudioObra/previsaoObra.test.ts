// 12/11: a previsão viva, a margem ao vivo, o caminho crítico, hoje na obra, o diário e o ponto da semana (previsaoObra.ts).
import { describe, expect, it } from "vitest";
import type { Plano, Tarefa } from "../motor";
import { antesEDepois, caminhoCritico, diarioDaObra, hojeNaObra, margemAoVivo, pontoDaSemana, previsao } from "./previsaoObra";
import { obraDeExemplo } from "./exemploObra";

const T = (nome: string, dia: number, dur: number, extra: Partial<Tarefa> = {}): Tarefa => ({ nome, svcs: [], dia, dur, sk: "x", h: dur * 8, tec: "a", fase: 1, ...extra });
const plano = (tasks: Tarefa[], dia: number): Plano => ({ tasks, estado: "em curso", dia, origem: "orcamento", inicio: "2027-03-01" });
const feita = (dia: number) => ({ estado: "validada" as const, horas: 8, fotos: [], envios: [{ q: "", dia, quem: "x", k: "feita" as const, horas: 8 }] });

describe("previsão", () => {
  it("no ritmo, o fim provável é o do plano; atrás, mais tarde", () => {
    const ok = plano([T("A", 0, 2, { exec: { ...feita(1), envios: [{ q: "", dia: 0, quem: "x", k: "registo", horas: 8 }, { q: "", dia: 1, quem: "x", k: "feita", horas: 8 }] } }), T("B", 2, 2)], 1);
    expect(previsao(ok).fimProvavel).toBe(4);
    const atras = plano([T("A", 0, 4, { exec: { estado: "em curso", horas: 4, fotos: [] } }), T("B", 4, 4)], 3);
    const r = previsao(atras);
    expect(r.ritmo).toBeLessThan(1);
    expect(r.fimProvavel).toBeGreaterThan(r.fimPlano);
    expect(r.planeadas).toHaveLength(r.fimProvavel);
    expect(r.reais).toHaveLength(4);
  });
});

describe("caminho crítico", () => {
  it("a cadeia sem folga é crítica; a que tem intervalo, não", () => {
    const p = plano([T("A", 0, 2), T("B", 2, 2), T("C", 0, 1), T("D", 4, 1)], 0);
    const c = caminhoCritico(p);
    expect([...c].sort()).toEqual([0, 1, 3]);
  });
});

describe("a obra de exemplo", () => {
  it("hoje, margem, diário, antes e depois e o ponto da semana", () => {
    const { S, d } = obraDeExemplo();
    const p = d.obra.plano!;
    const h = hojeNaObra(p);
    expect(h.pessoas.length).toBeGreaterThan(0);
    expect(h.atrasadas.map((x) => x.t.nome)).toContain("Revestimento de parede");
    const m = margemAoVivo(d, S)!;
    expect(m.valor).toBeGreaterThan(0);
    expect(m.custoVivo).toBeGreaterThanOrEqual(m.custoOrc - 1e6);
    expect(diarioDaObra(d).length).toBeGreaterThan(2);
    expect(antesEDepois(d)).not.toBeNull();
    const txt = pontoDaSemana(p, (k) => `dia ${k}`);
    expect(txt).toMatch(/A obra deve ficar pronta/);
    expect(txt).not.toMatch(/Sérgio|horas|\bh\b/);
  });
});
