// 25/11 (Rúben: «permitas criar novas tasks» e «drag and drop da lista da primeira coluna»): a ordem da lista do plano da obra
// (ordemPlano.ts), o Gantt do Estúdio da obra (o pegador, o teclado e o botão «Nova tarefa»), o Hoje do técnico e o portal.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { acoes } from "../motor";
import type { Ctx } from "../pecas";
import { moverNaOrdem, ordemDasTarefas, tarefasDaFase } from "../ordemPlano";
import { progressoDaObra } from "../obraCliente";
import { trabalhoDoTecnico } from "../trabalhoObra";
import { paraObra } from "../real/obraReal";
import { EstudioObra } from "./EstudioObra";
import { obraDeExemplo } from "./exemploObra";
import { retratoDe } from "./passosObra";

afterEach(cleanup);

function obra() {
  const { S, d } = obraDeExemplo();
  const A = acoes(S, () => {}, (fn) => fn());
  return { S, d, A, p: d.obra.plano! };
}

describe("a ordem da lista", () => {
  it("sem lugar marcado, por fase e pela data; mover marca o lugar de todas as da fase e não mexe nas datas", () => {
    const { p } = obra();
    p.tasks.push({ ...p.tasks[4], nome: "Outra da fase", exec: undefined, dia: p.tasks[4].dia + 1 });
    const fase = p.tasks[4].fase ?? 1, L = tarefasDaFase(p, fase);
    expect(L.length).toBeGreaterThan(1);
    const ultima = L[L.length - 1], datas = p.tasks.map((t) => [t.dia, t.dur]);
    expect(moverNaOrdem(p, ultima, 0)).toBe(true);
    expect(tarefasDaFase(p, fase)[0]).toBe(ultima);
    expect(L.every((i) => p.tasks[i].ordem != null)).toBe(true);
    expect(p.tasks.map((t) => [t.dia, t.dur])).toEqual(datas);
    expect(moverNaOrdem(p, ultima, 0)).toBe(false); // já lá está
    // as fases não se misturam
    const fs = ordemDasTarefas(p).map((i) => p.tasks[i].fase ?? 1);
    expect([...fs].sort((a, b) => a - b)).toEqual(fs);
  });
  it("o motor grava o lugar, fica no histórico e no anular / refazer; a projeção para a base leva a ordem da lista", () => {
    const { d, A, p } = obra();
    p.tasks.push({ ...p.tasks[4], nome: "Outra da fase", exec: undefined });
    const fase = p.tasks[4].fase ?? 1, L = tarefasDaFase(p, fase), ultima = L[L.length - 1];
    expect(A.ordemTarefaPlano(d.id, ultima, 0)).toBe(true);
    expect(d.hist[0].t).toBe(`Plano: ${p.tasks[ultima].nome} passou para o 1.º lugar da fase ${fase}`);
    expect(retratoDe(d)!.plano.tasks[ultima].ordem).toBe(0);
    const base = paraObra(d);
    const ordens = (base.tarefas ?? []).map((t) => t.ordem);
    expect(new Set(ordens).size).toBe(p.tasks.length);
    expect(base.tarefas![ultima].ordem).toBeLessThan(base.tarefas![L[0]].ordem);
  });
  it("o portal e o Hoje do técnico seguem a ordem da lista", () => {
    const { d, A, p } = obra();
    // duas tarefas do mesmo técnico no mesmo dia, na mesma fase
    const a = p.tasks.findIndex((t) => !t.exec && t.tec);
    const b = p.tasks.push({ ...p.tasks[a], nome: "Rematar os cantos", exec: undefined, mats: [] }) - 1;
    const antes = trabalhoDoTecnico([d], p.tasks[a].tec!, p.tasks[a].dia - p.dia).map((x) => x.ti);
    expect(antes.indexOf(a)).toBeLessThan(antes.indexOf(b));
    A.ordemTarefaPlano(d.id, b, tarefasDaFase(p, p.tasks[a].fase ?? 1).indexOf(a));
    const depois = trabalhoDoTecnico([d], p.tasks[a].tec!, p.tasks[a].dia - p.dia).map((x) => x.ti);
    expect(depois.indexOf(b)).toBeLessThan(depois.indexOf(a));
    const nomes = progressoDaObra(d)!.tarefas.map((t) => t.nome);
    expect(nomes.indexOf("Rematar os cantos")).toBeLessThan(nomes.findIndex((n, i) => i !== nomes.indexOf("Rematar os cantos") && n === progressoDaObra(d)!.tarefas[nomes.indexOf("Rematar os cantos") + 1]?.nome));
  });
});

function montar(prep?: (p: NonNullable<ReturnType<typeof obraDeExemplo>["d"]["obra"]["plano"]>) => void) {
  const { S, d } = obraDeExemplo();
  prep?.(d.obra.plano!);
  const A = acoes(S, () => {}, (fn) => fn());
  const ctx = { S, A, run: (fn: () => void) => { fn(); r.rerender(<EstudioObra ctx={ctx} d={d} fechar={() => {}} />); }, go: (fn: () => void) => () => fn(), q: "" } as unknown as Ctx;
  const r = render(<EstudioObra ctx={ctx} d={d} fechar={() => {}} />);
  return { S, d, p: d.obra.plano! };
}

describe("o Gantt do Estúdio da obra", () => {
  it("«Nova tarefa» no Gantt abre o painel, com o serviço do Catálogo e a tarefa interna", () => {
    montar();
    const gantt = screen.getByRole("region", { name: "O plano vivo" });
    fireEvent.click(within(gantt).getAllByRole("button", { name: "Nova tarefa" })[0]);
    const painel = screen.getByRole("complementary", { name: "Nova tarefa" });
    expect(within(painel).getByRole("list", { name: "Serviços" })).toBeTruthy();
    fireEvent.click(within(painel).getByRole("button", { name: /Tarefa interna/ }));
    expect(within(painel).getByText(/não muda o valor do contrato nem cria adenda/)).toBeTruthy();
  });
  it("o «+» de cada fase na primeira coluna abre a tarefa nova nessa fase; e há «Nova tarefa» no fim da lista", () => {
    const { p } = montar();
    const gantt = screen.getByRole("region", { name: "O plano vivo" });
    const fase = Math.max(...p.tasks.map((t) => t.fase ?? 1));
    fireEvent.click(within(gantt).getByRole("button", { name: new RegExp(`^Nova tarefa na fase ${fase} `) }));
    const painel = screen.getByRole("complementary", { name: "Nova tarefa" });
    fireEvent.click(within(painel).getByRole("button", { name: /Tarefa interna/ }));
    expect(within(painel).getByRole("button", { name: new RegExp(`^${fase} · `), pressed: true })).toBeTruthy();
    expect(within(gantt).getAllByRole("button", { name: "Nova tarefa" }).length).toBe(2); // no cabeçalho e no fim da lista
  });
  it("o pegador muda a ordem com as setas do teclado (e diz o lugar novo)", () => {
    const { d, p } = montar((q) => { q.tasks.push({ ...q.tasks[4], nome: "Outra da fase", exec: undefined }); });
    const fase = p.tasks[4].fase ?? 1, L = tarefasDaFase(p, fase), ti = L[1];
    const nome = new RegExp(`^Mudar a ordem de .*: lugar 2 de ${L.length} na fase ${fase}`);
    const pegador = screen.getAllByRole("button", { name: nome }).find((el) => el.getAttribute("data-pegador") === String(ti))!;
    fireEvent.keyDown(pegador, { key: "ArrowUp" });
    expect(tarefasDaFase(p, fase)[0]).toBe(ti);
    expect(d.hist[0].t).toContain("passou para o 1.º lugar");
    expect(screen.getByText(new RegExp(`lugar 1 de ${L.length} na fase ${fase}\\.$`))).toBeTruthy();
  });
});
