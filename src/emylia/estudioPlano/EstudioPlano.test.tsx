// 10/11 (Rúben, no Estúdio do plano): o alerta «noutra obra» diz qual, com a ligação ao Estúdio dela; a tarefa aberta tem a lista do que se
// pode fazer; «Nova tarefa»; a vista em Gantt; e «A obra» (as fotografias e o que se respondeu antes, em blocos que abrem e fecham).
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { TECS, acoes, seed, type Estado, type Negocio } from "../motor";
import type { Ctx } from "../pecas";
import { EstudioPlano } from "./EstudioPlano";

afterEach(cleanup);

function montar() {
  const S: Estado = seed();
  S.role = "operacoes";
  const [d1, d2] = S.deals.filter((x) => x.obra) as Negocio[];
  const T = TECS[0].id, inicio = "2027-03-01";
  d1.obra.plano = { tasks: [{ nome: "Outra obra", svcs: [], dia: 0, dur: 3, sk: TECS[0].sk, h: 24, tec: T }], estado: "aprovado", dia: 0, origem: "orcamento", inicio };
  d2.obra.plano = { tasks: [{ nome: "Canalização", svcs: [], dia: 1, dur: 1, sk: TECS[0].sk, h: 8, tec: T, fase: 2 }], estado: "por aprovar", dia: 0, origem: "orcamento", inicio };
  const A = acoes(S, () => {}, (fn) => fn());
  const ctx = { S, A, run: (fn: () => void) => fn(), go: (fn: () => void) => () => fn(), q: "" } as unknown as Ctx;
  render(<EstudioPlano ctx={ctx} d={d2} fechar={() => {}} />);
  return { S, d1, d2 };
}

describe("Estúdio do plano (10/11)", () => {
  it("o alerta diz em que obra está o técnico e abre o Estúdio dela", () => {
    const { d1 } = montar();
    const alertas = screen.getByRole("region", { name: "Alertas e sugestões" });
    const ligacao = within(alertas).getByRole("button", { name: new RegExp(d1.nome) });
    fireEvent.click(ligacao);
    // o Estúdio da outra obra, por cima
    expect(screen.getAllByRole("heading", { name: new RegExp(d1.nome) }).length).toBeGreaterThan(0);
  });
  it("a tarefa aberta tem a lista do que se pode fazer", () => {
    const { d1 } = montar();
    fireEvent.click(within(screen.getByRole("region", { name: "Alertas e sugestões" })).getByRole("button", { name: "Abrir" }));
    const acoes = screen.getByRole("region", { name: "O que pode fazer" });
    expect(within(acoes).getByRole("button", { name: new RegExp(`Abrir a obra ${d1.nome}`) })).toBeTruthy();
    expect(within(acoes).getByRole("button", { name: /Adiar até estar livre/ })).toBeTruthy();
    expect(within(acoes).getByRole("button", { name: /Tirar do plano/ })).toBeTruthy();
  });
  it("Gantt: uma linha por tarefa, pelas fases; «A obra» abre os blocos da visita", () => {
    montar();
    fireEvent.click(screen.getByRole("button", { name: "Gantt" }));
    expect(screen.getByRole("rowgroup", { name: /Fase 2/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "A obra" }));
    const painel = screen.getByRole("complementary", { name: "A obra" });
    expect(within(painel).getByText("Fotografias")).toBeTruthy();
    expect(within(painel).getByText("Medidas")).toBeTruthy();
  });
  it("«Nova tarefa» abre o painel de a criar", () => {
    montar();
    fireEvent.click(screen.getByRole("button", { name: "Nova tarefa" }));
    expect(screen.getByRole("complementary", { name: "Nova tarefa" })).toBeTruthy();
  });
});
