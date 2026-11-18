// 17/11 (A-Z na Mudelar): a obra arrancou antes do plano; «Adiantar para hoje» traz as tarefas por fazer para hoje, pela mesma ordem.
import { describe, expect, it } from "vitest";
import { acoes, seed } from "./motor";
import { adiantavel } from "./obraOps";

describe("adiantar o plano da obra em curso", () => {
  const obra = () => {
    const S = seed(), A = acoes(S, () => {}, (fn) => fn()), d = S.deals.find((x) => x.id === 1027)!;
    const p = d.obra.plano!;
    p.estado = "em curso"; p.dia = 0; S.role = "operacoes";
    for (const t of p.tasks) { delete t.exec; t.dia += 5; }
    return { S, A, d, p };
  };
  it("as tarefas por fazer começam hoje, com os mesmos intervalos entre elas", () => {
    const { A, d, p } = obra();
    const antes = p.tasks.map((t) => t.dia);
    expect(adiantavel(p)).toBe(true);
    A.adiantarPlano(d.id);
    const min = Math.min(...antes);
    expect(p.tasks.map((t) => t.dia)).toEqual(antes.map((x) => x - min));
    expect(adiantavel(p)).toBe(false);
    expect(d.hist[0].t).toMatch(/^Plano adiantado/);
  });
  it("com uma tarefa já começada, não se mexe", () => {
    const { A, d, p } = obra();
    p.tasks[0].exec = { estado: "em curso", horas: 0, fotos: [] };
    expect(adiantavel(p)).toBe(false);
  });
});
