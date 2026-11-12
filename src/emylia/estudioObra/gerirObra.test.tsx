// 11/11 (Rúben: «na gestão da obra a decorrer… o gestor tem de ter a capacidade de gerir tudo por completo, mais ainda do que na fase de
// aprovação»): o motor com a obra em curso (as tarefas que ainda não começaram mexem-se; a execução pelo gestor) e os separadores do Estúdio.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { acoes, porqueNaoMexe } from "../motor";
import type { Ctx } from "../pecas";
import { EstudioObra } from "./EstudioObra";
import { obraDeExemplo } from "./exemploObra";

afterEach(cleanup);

function obra() {
  const { S, d } = obraDeExemplo();
  const avisos: string[] = [];
  const A = acoes(S, (a) => avisos.push(a.msg), (fn) => fn());
  const p = d.obra.plano!;
  const ix = (nome: string) => p.tasks.findIndex((t) => t.nome === nome);
  return { S, d, A, p, ix, avisos };
}

describe("o motor com a obra em curso", () => {
  it("a tarefa que ainda não começou muda de dia e de dias (não para antes de hoje); a que começou não", () => {
    const { d, A, p, ix, avisos } = obra();
    const mont = ix("Montagem de móveis"), rev = ix("Revestimento de parede");
    expect(porqueNaoMexe(p, mont)).toBeNull();
    A.ajustarTarefa(d.id, mont, { dia: 1 });
    expect(p.tasks[mont].dia).toBe(p.dia); // não antes de hoje
    A.ajustarTarefa(d.id, mont, { dur: p.tasks[mont].dur + 1 });
    expect(p.tasks[mont].dur).toBe(5);
    const antes = p.tasks[rev].dia;
    A.ajustarTarefa(d.id, rev, { dia: antes + 2 });
    expect(p.tasks[rev].dia).toBe(antes);
    expect(avisos).toContain("Esta tarefa já começou");
    // a nota muda-se sempre
    A.ajustarTarefa(d.id, rev, { nota: "levar o andaime" });
    expect(p.tasks[rev].nota).toBe("levar o andaime");
  });
  it("mudar a fase e desfazer só nas que não começaram; a tarefa nova não começa antes de hoje", () => {
    const { d, A, p, ix } = obra();
    const mont = ix("Montagem de móveis");
    const snap = p.tasks.map((t) => ({ dia: t.dia, dur: t.dur, h: t.h, tec: t.tec }));
    A.moverTarefaPlano(d.id, mont, { fase: 3 });
    expect(p.tasks[mont].fase).toBe(3);
    A.ajustarTarefa(d.id, mont, { dia: p.tasks[mont].dia + 2 });
    A.reporTarefasPlano(d.id, snap);
    expect(p.tasks[mont].dia).toBe(snap[mont].dia);
  });
  it("pausar e retomar, reabrir, corrigir as horas, dividir e avisar o cliente", () => {
    const { d, A, p, ix } = obra();
    const rev = ix("Revestimento de parede"), dem = ix("Demolição e entulho"), mont = ix("Montagem de móveis");
    A.pausarTarefa(d.id, rev, "Falta material");
    expect(p.tasks[rev].exec?.pausa?.motivo).toBe("Falta material");
    A.retomarTarefa(d.id, rev);
    expect(p.tasks[rev].exec?.pausa).toBeUndefined();
    A.reabrirTarefa(d.id, dem, "Fissura na parede");
    expect(p.tasks[dem].exec?.estado).toBe("em curso");
    expect(p.tasks[dem].dia + p.tasks[dem].dur).toBeGreaterThan(p.dia); // fica até hoje
    A.corrigirHoras(d.id, rev, 11.5);
    expect(p.tasks[rev].exec?.horas).toBe(11.5);
    const n = p.tasks.length, dur = p.tasks[mont].dur, h = p.tasks[mont].h;
    const nt = A.dividirTarefa(d.id, mont, 1)!;
    expect(p.tasks.length).toBe(n + 1);
    expect(p.tasks[mont].dur).toBe(1);
    expect(p.tasks[nt].dur).toBe(dur - 1);
    expect(p.tasks[nt].dia).toBe(p.tasks[mont].dia + 1);
    expect(p.tasks[mont].h + p.tasks[nt].h).toBeCloseTo(h, 0);
    A.avisarClienteObra(d.id, "Amanhã a equipa chega às 9h.");
    expect(d.obra.alteracoes![0]).toMatchObject({ cliente: true, avisoCliente: "Amanhã a equipa chega às 9h." });
  });
});

function montar() {
  const { S, d } = obraDeExemplo();
  const A = acoes(S, () => {}, (fn) => fn());
  const ctx = { S, A, run: (fn: () => void) => { fn(); r.rerender(<EstudioObra ctx={ctx} d={d} fechar={() => {}} />); }, go: (fn: () => void) => () => fn(), q: "" } as unknown as Ctx;
  const r = render(<EstudioObra ctx={ctx} d={d} fechar={() => {}} />);
  return { S, d };
}

describe("o Estúdio da obra: gerir tudo", () => {
  it("a tarefa aberta é a do Estúdio do plano (quando, quem, fase, nota) com a execução por cima", () => {
    montar();
    fireEvent.click(screen.getByRole("button", { name: /^Montagem de móveis: por começar/ }));
    const painel = screen.getByRole("complementary", { name: "A tarefa" });
    expect(within(painel).getByRole("region", { name: "Quando" })).toBeTruthy();
    expect(within(painel).getByRole("region", { name: "A execução" })).toBeTruthy();
    expect(within(painel).getByText("Quem faz")).toBeTruthy();
    // ainda não começou: muda-se o dia ali mesmo
    expect((within(painel).getByRole("button", { name: "Começa: mais" }) as HTMLButtonElement).disabled).toBe(false);
  });
  it("a feita valida-se na tarefa; a validada reabre-se com o motivo", () => {
    const { d } = montar();
    const can = d.obra.plano!.tasks.findIndex((t) => t.nome === "Canalização");
    fireEvent.click(screen.getByRole("button", { name: /^Canalização: feita/ }));
    const exec = within(screen.getByRole("complementary", { name: "A tarefa" })).getByRole("region", { name: "A execução" });
    fireEvent.click(within(exec).getByRole("button", { name: "Validar" }));
    expect(d.obra.plano!.tasks[can].exec?.estado).toBe("validada");
    fireEvent.click(within(exec).getByRole("button", { name: "Reabrir" }));
    fireEvent.change(within(exec).getByPlaceholderText(/fissura/), { target: { value: "Fuga na união" } });
    fireEvent.click(within(exec).getByRole("button", { name: "Reabrir a tarefa" }));
    expect(d.obra.plano!.tasks[can].exec?.estado).toBe("em curso");
  });
  it("os separadores: execução, materiais, equipa, cliente e fecho", () => {
    const { d } = montar();
    fireEvent.click(screen.getByRole("tab", { name: /Execução/ }));
    expect(screen.getByRole("region", { name: "Por validar" })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /Materiais/ }));
    expect(screen.getByRole("region", { name: "O que chegou e o que falta" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Pedir mais ou devolver" })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /Equipa/ }));
    expect(screen.getByRole("article", { name: "Paulo Mota" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Semana seguinte" }));
    expect(screen.getAllByRole("button", { name: /Marta Lima/ }).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("tab", { name: /Cliente/ }));
    fireEvent.click(screen.getByRole("button", { name: "Amanhã a equipa chega às 9h." }));
    fireEvent.click(screen.getByRole("button", { name: /Avisar no portal/ }));
    expect(d.obra.alteracoes![0].avisoCliente).toBe("Amanhã a equipa chega às 9h.");
    fireEvent.click(screen.getByRole("tab", { name: /Fecho/ }));
    expect(screen.getByRole("region", { name: "Para fechar a obra" })).toBeTruthy();
    fireEvent.click(within(screen.getByRole("region", { name: "A vistoria final" })).getByRole("button", { name: "5" }));
    expect(d.f.satisfacao).toBe("5");
  });
});
