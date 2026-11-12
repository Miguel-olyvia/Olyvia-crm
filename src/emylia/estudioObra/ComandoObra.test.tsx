// 12/11 (Rúben: «deixa isto WOW»): o pulso, o comando de hoje, a previsão viva, o diário, a agenda da equipa e o ponto da semana.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { acoes } from "../motor";
import type { Ctx } from "../pecas";
import { EstudioObra } from "./EstudioObra";
import { obraDeExemplo } from "./exemploObra";

afterEach(cleanup);

function montar() {
  const { S, d } = obraDeExemplo();
  const A = acoes(S, () => {}, (fn) => fn());
  const ctx = { S, A, run: (fn: () => void) => { fn(); r.rerender(<EstudioObra ctx={ctx} d={d} fechar={() => {}} />); }, go: (fn: () => void) => () => fn(), q: "" } as unknown as Ctx;
  const r = render(<EstudioObra ctx={ctx} d={d} fechar={() => {}} />);
  return { S, d };
}

describe("o comando da obra", () => {
  it("o pulso: os números são botões e levam ao sítio deles", () => {
    montar();
    const pulso = screen.getByRole("region", { name: "O pulso da obra" });
    expect(within(pulso).getByRole("button", { name: /Fim provável/ })).toBeTruthy();
    expect(within(pulso).getByRole("button", { name: /Margem ao vivo/ })).toBeTruthy();
    fireEvent.click(within(pulso).getByRole("button", { name: /Feito/ }));
    expect(screen.getByRole("tab", { name: /Execução/ }).getAttribute("aria-selected")).toBe("true");
  });
  it("hoje na obra: quem está e «Precisa de ti» resolve num toque", () => {
    const { d } = montar();
    const hoje = screen.getByRole("region", { name: "Hoje na obra" });
    expect(within(hoje).getByText("Sérgio Faria")).toBeTruthy();
    const can = d.obra.plano!.tasks.findIndex((t) => t.nome === "Canalização");
    fireEvent.click(within(hoje).getByRole("button", { name: "Validar" }));
    expect(d.obra.plano!.tasks[can].exec?.estado).toBe("validada");
  });
  it("a previsão viva: o gráfico, a margem e o caminho crítico", () => {
    montar();
    const pv = screen.getByRole("region", { name: "A previsão viva" });
    expect(within(pv).getByRole("img", { name: /Horas/ })).toBeTruthy();
    expect(within(pv).getByText("Margem ao vivo")).toBeTruthy();
    expect(within(pv).getByText("Caminho crítico")).toBeTruthy();
  });
  it("o diário com o antes e depois; o ponto da semana publica no portal", () => {
    const { d } = montar();
    fireEvent.click(screen.getByRole("tab", { name: /Diário/ }));
    expect(screen.getByRole("region", { name: "Antes e depois" })).toBeTruthy();
    expect(screen.getByRole("slider", { name: "Comparar o antes e o depois" })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /Cliente/ }));
    const ponto = screen.getByRole("region", { name: "O ponto da semana" });
    fireEvent.click(within(ponto).getByRole("button", { name: /Publicar no portal/ }));
    expect(d.obra.alteracoes![0].avisoCliente).toMatch(/A obra deve ficar pronta/);
  });
  it("a agenda da equipa: uma semana por pessoa, com as outras obras pelo nome", () => {
    montar();
    fireEvent.click(screen.getByRole("tab", { name: /Equipa/ }));
    const ag = screen.getByRole("region", { name: "A agenda da equipa" });
    fireEvent.click(within(ag).getByRole("button", { name: "Semana seguinte" }));
    expect(within(ag).getAllByRole("button", { name: /Marta Lima/ }).length).toBeGreaterThan(0);
    expect(within(ag).getAllByRole("button", { name: /Montagem de móveis/ }).length).toBeGreaterThan(0);
  });
});
