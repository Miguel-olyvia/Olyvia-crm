// 23/11 (revisão: «Olyvia, o Elvis só pode na quinta → mostra o impacto e aplica com um toque, e entra no ↶ ↷»).
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { acoes } from "../motor";
import type { Ctx } from "../pecas";
import { diasDaObra } from "../planoObra";
import { diasQuePode, inicioDoPlano } from "../preparacaoObra";
import { EstudioObra } from "./EstudioObra";
import { obraDeExemplo } from "./exemploObra";
import { naoCabem } from "./planoVivo";

afterEach(cleanup);

/** A obra de exemplo com a montagem num só dia (para caber às quintas). */
function obra() {
  const x = obraDeExemplo(), p = x.d.obra.plano!;
  const mont = p.tasks.findIndex((t) => t.nome === "Montagem de móveis");
  p.tasks[mont].dur = 1;
  const datas = diasDaObra(inicioDoPlano(p)!, 80);
  return { ...x, p, mont, datas, tec: p.tasks[mont].tec!, A: acoes(x.S, () => {}, (fn) => fn()) };
}

describe("os dias de um técnico", () => {
  it("«às quintas», «às segundas e quintas»", () => {
    expect(diasQuePode([4])).toBe("às quintas");
    expect(diasQuePode([4, 1])).toBe("às segundas e quintas");
  });
  it("o motor: só às quintas, a tarefa dele passa para uma quinta, a restrição fica no plano, e o anular repõe tudo", () => {
    const { d, p, mont, datas, tec, A } = obra();
    const antes = JSON.parse(JSON.stringify({ tasks: p.tasks.map((t) => ({ dia: t.dia, dur: t.dur })), r: p.restricoes ?? null }));
    const r0 = { tasks: p.tasks.map((t) => ({ ...t })), estado: p.estado };
    expect(A.restricaoTecnico(d.id, tec, [4])).toBe(true);
    expect(p.restricoes).toEqual([{ tec, dias: [4] }]);
    expect(datas[p.tasks[mont].dia].getDay()).toBe(4);
    expect(d.hist[0].t).toMatch(/só pode às quintas/);
    // tirar a restrição
    A.restricaoTecnico(d.id, tec, null);
    expect(p.restricoes).toBeUndefined();
    // o anular (reporPlanoObra) repõe as tarefas e a falta de restrição
    A.restricaoTecnico(d.id, tec, [4]);
    A.reporPlanoObra(d.id, r0 as never, "teste", "anular");
    // (a tarefa atrasada que já começou não volta atrás: o anular não mexe nas que já começaram)
    expect({ mont: { dia: p.tasks[mont].dia, dur: p.tasks[mont].dur }, r: p.restricoes ?? null }).toEqual({ mont: antes.tasks[mont], r: antes.r });
  });
  it("uma tarefa de vários dias seguidos não cabe só às quintas (para a passar a outro)", () => {
    const x = obraDeExemplo(), p = x.d.obra.plano!;
    const mont = p.tasks.findIndex((t) => t.nome === "Montagem de móveis");
    const datas = diasDaObra(inicioDoPlano(p)!, 80);
    expect(p.tasks[mont].dur).toBeGreaterThan(1);
    expect(naoCabem(p, p.tasks[mont].tec!, [4], (k) => datas[k] ?? null)).toContain(mont);
  });
  it("no Estúdio: escolher a pessoa e a quinta, ver o impacto, aplicar com um toque, e ↶ anula", () => {
    const x = obra();
    const ctx = { S: x.S, A: x.A, run: (fn: () => void) => fn(), go: (fn: () => void) => () => fn(), q: "" } as unknown as Ctx;
    render(<EstudioObra ctx={ctx} d={x.d} fechar={() => {}} />);
    const sec = screen.getByRole("region", { name: "Os dias de um técnico" });
    fireEvent.change(within(sec).getByRole("combobox", { name: "Técnico" }), { target: { value: x.tec } });
    fireEvent.click(within(sec).getByRole("button", { name: "Quinta" }));
    fireEvent.click(within(sec).getByRole("button", { name: "Ver o impacto" }));
    const previa = screen.getByRole("region", { name: "Antes de aplicar" });
    expect(within(previa).getByText(/só pode às quintas$/)).toBeTruthy();
    const aviso = within(previa).queryByRole("checkbox", { name: /Avisar o cliente/ }) as HTMLInputElement | null;
    if (aviso?.checked) fireEvent.click(aviso);
    fireEvent.click(within(previa).getByRole("button", { name: /Aplicar ao plano/ }));
    expect(x.p.restricoes).toEqual([{ tec: x.tec, dias: [4] }]);
    expect(x.datas[x.p.tasks[x.mont].dia].getDay()).toBe(4);
    expect(within(screen.getByRole("list", { name: "Os dias marcados" })).getByText(/só pode às quintas/)).toBeTruthy();
    fireEvent.click(within(screen.getByRole("group", { name: "Anular e refazer" })).getByRole("button", { name: /^Anular: / }));
    expect(x.p.restricoes).toBeUndefined();
  });
});
