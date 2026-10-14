// Os equipamentos na obra e a receita contra o real (regras puras).
import { describe, expect, it } from "vitest";
import { seed, type Estado } from "../motor";
import { custos0, receitaDe, custoReceita } from "./custosModelo";
import {
  chaveEquip, confirmarHorasEquip, custoEquipamentos, equipamentosObra, horasReais, horasSugeridas, opcoesHoras,
} from "./equipamentosObra";
import { previstoReal, regVazio } from "./operacoes";
import { fatoresDe } from "./realExemplo";
import {
  MIN_OBRAS, OBRAS_CONCLUIDAS_EXEMPLO, compararServico, comparacaoObra, horasPorMedida, horasReceita, mediana, podeUsarMediana, receitaComHoras,
} from "./receitaReal";

const deal = (S: Estado, id: number) => S.deals.find((d) => d.id === id)!;

describe("equipamentos na obra", () => {
  it("vêm das receitas (horas por medida × medida), por tarefa do plano, com os dias reservados", () => {
    const S = seed(), d = deal(S, 1022);
    const L = equipamentosObra(d, S, custos0(), regVazio());
    expect(L.map((l) => [l.nome, l.tarefaNome, l.datas, l.hPrev])).toEqual([
      ["Carro de mão", "Demolição", "seg 13/10", 2], // demolição: 0,5 h/m² × 4 m²
      ["Martelo demolidor", "Demolição", "seg 13/10", 2],
      ["Prensa de multicamada", "Canalização", "ter 14/10", 1.2], // 0,4 h/pt × 3 pt
    ]);
    expect(L.every((l) => l.feita && l.hReal === null)).toBe(true);
    expect(L[2].servicos).toEqual(["Canalização"]);
    expect(L[1].eh).toBeCloseTo(900 / 1500);
  });
  it("uma obra sem plano ou sem orçamento não tem equipamentos", () => {
    const S = seed();
    expect(equipamentosObra(deal(S, 1043), S, custos0(), regVazio())).toEqual([]);
  });
  it("no fecho: a sugestão à meia hora, as opções à volta, e a confirmação no registo (sem mexer no antigo)", () => {
    expect(horasSugeridas(2, 1.1)).toBe(2);
    expect(horasSugeridas(2, 1.3)).toBe(2.5);
    expect(horasSugeridas(0.1)).toBe(0.5);
    expect(opcoesHoras(2)).toEqual([1, 1.5, 2, 2.5, 3]);
    expect(opcoesHoras(0.5)).toEqual([0.5, 1, 1.5]);
    const r0 = regVazio(), r1 = confirmarHorasEquip(r0, chaveEquip(0, "e-martelo-demolidor"), 3);
    expect(r1.horasEquip).toEqual({ "0:e-martelo-demolidor": 3 });
    expect(r0.horasEquip).toEqual({});
    expect(confirmarHorasEquip(r1, "x", 0)).toBe(r1);
  });
  it("o custo real dos equipamentos usa as horas confirmadas; as outras são de exemplo", () => {
    const S = seed(), d = deal(S, 1050), C = custos0();
    const f = fatoresDe(1050).eq;
    const antes = custoEquipamentos(equipamentosObra(d, S, C, regVazio()), f);
    expect(antes.feitas).toBe(11); // eram 3; 14/10: os extras da Joana (c28, c3, c14 e c19) trazem os equipamentos da receita da Mudelar
    expect(antes.confirmadas).toBe(0);
    expect(antes.real).toBeLessThan(antes.prev); // fator de exemplo 0,92
    const reg = confirmarHorasEquip(regVazio(), "0:e-martelo-demolidor", 4);
    const L = equipamentosObra(d, S, C, reg), depois = custoEquipamentos(L, f);
    const mart = L.find((l) => l.equip === "e-martelo-demolidor")!;
    expect(mart.hReal).toBe(4);
    expect(horasReais(mart, f)).toBe(4);
    expect(depois.confirmadas).toBe(1);
    expect(depois.real).toBeCloseTo(antes.real + (4 - 2.5 * f) * mart.eh, 1);
    // e o previsto contra real passa a usar estas contas na linha dos equipamentos
    const R = previstoReal(d, S, fatoresDe(1050), depois);
    expect(R.linhas.find((l) => l.k === "eq")).toEqual({ k: "eq", nome: "Equipamentos", prev: depois.prev, real: depois.real });
  });
  it("só contam as tarefas feitas", () => {
    const S = seed(), d = deal(S, 1022);
    d.obra.plano!.dia = 0; // nenhuma tarefa feita ainda
    const ce = custoEquipamentos(equipamentosObra(d, S, custos0(), regVazio()), 1);
    expect(ce).toEqual({ prev: 0, real: 0, confirmadas: 0, feitas: 0 });
  });
});

describe("receita contra o real", () => {
  it("a mediana (par e ímpar) e as horas por medida das obras concluídas", () => {
    expect(mediana([])).toBeNull();
    expect(mediana([3, 1, 2])).toBe(2);
    expect(mediana([4, 1, 3, 2])).toBe(2.5);
    expect(horasPorMedida("teto")).toHaveLength(2);
    expect(horasPorMedida("revest").map((x) => +x.toFixed(2))).toEqual([0.95, 0.9, 0.92, 0.88, 0.97]);
    expect(OBRAS_CONCLUIDAS_EXEMPLO.length).toBeGreaterThanOrEqual(MIN_OBRAS);
  });
  it("compara a receita com a mediana: acima, abaixo, bate (até 5%) ou poucas obras", () => {
    expect(compararServico("revest", "Revestimento", "m²", 0.75)).toMatchObject({ mediana: 0.92, n: 5, pct: 23, estado: "acima" });
    expect(compararServico("demol", "Demolição", "m²", 0.5)).toMatchObject({ mediana: 0.47, pct: -6, estado: "abaixo" });
    expect(compararServico("canal", "Canalização", "pt", 2)).toMatchObject({ estado: "bate" });
    expect(compararServico("teto", "Teto", "m²", 0.9)).toMatchObject({ n: 2, estado: "poucas" });
    expect(compararServico("xpto", "?", "un", 1)).toMatchObject({ mediana: null, n: 0, estado: "poucas" });
    expect(podeUsarMediana(compararServico("revest", "R", "m²", 0.75))).toBe(true);
    expect(podeUsarMediana(compararServico("canal", "C", "pt", 2))).toBe(false);
  });
  it("os serviços da obra, um por serviço, com as horas da receita", () => {
    const S = seed();
    const L = comparacaoObra(deal(S, 1022), S, custos0());
    expect(L.map((c) => [c.sid, c.receita, c.estado])).toEqual([
      ["demol", 0.5, "abaixo"], ["canal", 2, "bate"], ["revest", 0.75, "acima"], ["pav", 0.85, "acima"], ["loucas", 1.35, "bate"],
    ]);
  });
  it("usar a mediana: os passos mudam na mesma proporção, a soma bate, a receita fica editada e o original não muda", () => {
    const S = seed(), C = custos0();
    const rec = receitaDe(C, "revest", S.svc.revest, S.cfg.alvo)!;
    const nova = receitaComHoras(rec, 0.92);
    expect(horasReceita(nova)).toBe(0.92);
    expect(nova.origem).toBe("editada");
    expect(horasReceita(rec)).toBe(0.75);
    const dois = { ...rec, mo: [{ id: "a", n: "A", perfil: "p", h: 1 }, { id: "b", n: "B", perfil: "p", h: 2 }] };
    expect(receitaComHoras(dois, 1).mo.map((p) => p.h)).toEqual([0.33, 0.67]);
    expect(receitaComHoras({ ...rec, mo: [] }, 1.2, "lad").mo).toEqual([{ id: "p1", n: "Execução", perfil: "lad", h: 1.2 }]);
    // mais horas na receita, mais custo
    expect(custoReceita(nova, C, false).mo).toBeGreaterThan(custoReceita(rec, C, false).mo);
  });
});
