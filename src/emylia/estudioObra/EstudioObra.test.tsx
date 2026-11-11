// 11/11: o Estúdio da obra no ecrã, com a obra de exemplo: os alertas, «E se…?» (replanear e um atraso) e o imprevisto com custo.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { acoes } from "../motor";
import type { Ctx } from "../pecas";
import { EstudioObra } from "./EstudioObra";
import { obraDeExemplo } from "./exemploObra";

afterEach(cleanup);

function montar() {
  const { S, d } = obraDeExemplo();
  let A = acoes(S, () => {}, (fn) => fn());
  const ctx = { S, A, run: (fn: () => void) => { fn(); r.rerender(<EstudioObra ctx={ctx} d={d} fechar={() => {}} />); }, go: (fn: () => void) => () => fn(), q: "" } as unknown as Ctx;
  const r = render(<EstudioObra ctx={ctx} d={d} fechar={() => {}} />);
  A = ctx.A;
  return { S, d };
}

describe("Estúdio da obra (11/11)", () => {
  it("mostra o plano vivo, os números e os alertas com o próximo passo", () => {
    montar();
    expect(screen.getByRole("region", { name: "O plano vivo" })).toBeTruthy();
    const alertas = screen.getByRole("region", { name: "Alertas" });
    expect(within(alertas).getByRole("group", { name: /Revestimento de parede está atrasada/ })).toBeTruthy();
    expect(within(alertas).getByRole("button", { name: "Prolongar até hoje" })).toBeTruthy();
    expect(within(alertas).getByRole("group", { name: /Há folga/ })).toBeTruthy();
    // um só botão principal: validar o que está feito
    expect(screen.getByRole("button", { name: /Validar a tarefa feita/ })).toBeTruthy();
  });
  it("Replanear: primeiro a pré-visualização, depois aplicar (fica nos ajustes da obra)", () => {
    const { d } = montar();
    fireEvent.click(within(screen.getByRole("banner")).getByRole("button", { name: "Replanear" }));
    const previa = screen.getByRole("region", { name: "Antes de aplicar" });
    expect(within(previa).getByText(/tarefas? mud/)).toBeTruthy();
    expect(d.obra.alteracoes ?? []).toHaveLength(1); // só a do imprevisto do exemplo
    fireEvent.click(within(previa).getByRole("button", { name: /Aplicar ao plano/ }));
    expect(d.obra.alteracoes![0].t).toMatch(/Replaneado/);
  });
  it("na tarefa, «E se atrasar?» mostra no plano e diz por quem a montagem espera", () => {
    montar();
    fireEvent.click(screen.getByRole("button", { name: /^Pavimento cerâmico: parada/ }));
    const painel = screen.getByRole("complementary", { name: "A tarefa" });
    fireEvent.click(within(painel).getByRole("button", { name: "Mais um dia" }));
    fireEvent.click(within(painel).getByRole("button", { name: "Ver no plano" }));
    const previa = screen.getByRole("region", { name: "Antes de aplicar" });
    expect(within(previa).getByText(/mais 2 dias/)).toBeTruthy();
    expect(within(previa).getByText(/espera pelo Paulo/)).toBeTruthy();
  });
  it("o imprevisto com custo: o impacto no prazo e no valor, e a adenda vai ao cliente", () => {
    const { d } = montar();
    fireEvent.click(screen.getByRole("button", { name: "Registar imprevisto" }));
    const painel = screen.getByRole("complementary", { name: "Registar imprevisto" });
    fireEvent.change(within(painel).getByPlaceholderText(/cano de esgoto/), { target: { value: "Tubo partido na parede" } });
    fireEvent.click(within(painel).getByRole("button", { name: "Revestimento de parede" }));
    fireEvent.click(within(painel).getByRole("button", { name: "Sim, vai numa adenda" }));
    const imp = within(painel).getByRole("region", { name: "O impacto" });
    expect(within(imp).getByText(/^\+[\d.,]+ €$/)).toBeTruthy();
    expect(within(imp).getByText(/Acaba a/)).toBeTruthy();
    fireEvent.click(within(painel).getByRole("button", { name: "Registar e propor ao cliente" }));
    const im = d.obra.imprevistos!.find((x) => x.texto === "Tubo partido na parede")!;
    expect(im.estado).toBe("proposta");
    expect(im.adenda).toBeTruthy();
    expect(im.custo).toBeGreaterThan(0);
  });
});

describe("Estúdio da obra: quem está livre quando uma tarefa espera", () => {
  it("na pré-visualização, a tarefa que espera por um técnico ocupado oferece passar a quem está livre", () => {
    const { S, d } = obraDeExemplo();
    const p = d.obra.plano!, ti = p.tasks.findIndex((t) => t.nome === "Montagem de móveis");
    // um segundo montador, livre
    const pm = S.tecnicos!.find((x) => x.id === p.tasks[ti].tec)!;
    S.tecnicos!.push({ ...pm, id: "pm2", n: "Pedro Montes" });
    const A = acoes(S, () => {}, (fn) => fn());
    const ctx = { S, A, run: (fn: () => void) => fn(), go: (fn: () => void) => () => fn(), q: "" } as unknown as Ctx;
    render(<EstudioObra ctx={ctx} d={d} fechar={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /^Pavimento cerâmico: parada/ }));
    const painel = screen.getByRole("complementary", { name: "A tarefa" });
    fireEvent.click(within(painel).getByRole("button", { name: "Mais um dia" }));
    fireEvent.click(within(painel).getByRole("button", { name: "Ver no plano" }));
    const previa = screen.getByRole("region", { name: "Antes de aplicar" });
    fireEvent.click(within(previa).getByRole("button", { name: /Passar para Pedro/ }));
    expect(p.tasks[ti].tec).toBe("pm2");
  });
});

describe("Estúdio da obra: o teclado", () => {
  it("Esc fecha o painel e depois o Estúdio", () => {
    const { S, d } = obraDeExemplo();
    const A = acoes(S, () => {}, (fn) => fn());
    let fechado = false;
    const ctx = { S, A, run: (fn: () => void) => fn(), go: (fn: () => void) => () => fn(), q: "" } as unknown as Ctx;
    render(<EstudioObra ctx={ctx} d={d} fechar={() => { fechado = true; }} />);
    fireEvent.click(screen.getByRole("button", { name: "Registar imprevisto" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(fechado).toBe(false);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(fechado).toBe(true);
  });
});
