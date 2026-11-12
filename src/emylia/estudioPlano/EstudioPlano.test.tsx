// 10/11 (Rúben, no Estúdio do plano): o alerta «noutra obra» diz qual, com a ligação ao Estúdio dela; a tarefa aberta tem a lista do que se
// pode fazer; «Nova tarefa»; a vista em Gantt; e «A obra» (as fotografias e o que se respondeu antes, em blocos que abrem e fecham).
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { TECS, acoes, seed, type Estado, type Negocio } from "../motor";
import type { Ctx } from "../pecas";
import { EstudioPlano } from "./EstudioPlano";

afterEach(cleanup);

function montar(antes?: (d: Negocio) => void) {
  const S: Estado = seed();
  S.role = "operacoes";
  const [d1, d2] = S.deals.filter((x) => x.obra) as Negocio[];
  const T = TECS[0].id, inicio = "2027-03-01";
  d1.obra.plano = { tasks: [{ nome: "Outra obra", svcs: [], dia: 0, dur: 3, sk: TECS[0].sk, h: 24, tec: T }], estado: "aprovado", dia: 0, origem: "orcamento", inicio };
  d2.obra.plano = { tasks: [{ nome: "Canalização", svcs: [], dia: 1, dur: 1, sk: TECS[0].sk, h: 8, tec: T, fase: 2 }], estado: "por aprovar", dia: 0, origem: "orcamento", inicio };
  antes?.(d2);
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

// 11/11 (Rúben: «muito mais bonito, dinâmico e interativo, nada de cartões sem interação»)
describe("Estúdio do plano mais vivo (11/11)", () => {
  it("mudar uma tarefa mostra «Desfazer», que repõe como estava", () => {
    const { d2 } = montar();
    const barra = screen.getByRole("button", { name: /^Canalização: 1 dia/ });
    fireEvent.keyDown(barra, { key: "ArrowRight" });
    expect(d2.obra.plano!.tasks[0].dia).toBe(2);
    fireEvent.click(screen.getByRole("button", { name: "Desfazer" }));
    expect(d2.obra.plano!.tasks[0].dia).toBe(1);
  });
  it("na tarefa aberta, o início e os dias mudam-se à mão", () => {
    const { d2 } = montar();
    fireEvent.click(within(screen.getByRole("region", { name: "Alertas e sugestões" })).getByRole("button", { name: "Abrir" }));
    const quando = screen.getByRole("region", { name: "Quando" });
    fireEvent.click(within(quando).getByRole("button", { name: "Dura: mais" }));
    expect(d2.obra.plano!.tasks[0].dur).toBe(2);
    fireEvent.click(within(quando).getByRole("button", { name: "Começa: mais" }));
    expect(d2.obra.plano!.tasks[0].dia).toBe(2);
  });
  it("tocar numa fase ou numa pessoa destaca as tarefas; «Ver tudo» volta", () => {
    montar();
    const fase = within(screen.getByRole("region", { name: "A obra no tempo" })).getByRole("button", { name: /2 · / });
    fireEvent.click(fase);
    expect(fase.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Ver tudo" }));
    expect(fase.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: new RegExp(`Destacar as tarefas de ${TECS[0].n}`) }));
    expect(screen.getByRole("button", { name: "Ver tudo" })).toBeTruthy();
  });
  it("aprovar o plano tem festa", () => {
    const { d2 } = montar((d) => { d.f.retif_aceite = "2027-02-20"; d.fin.pago = true; }); // 12/11: o plano aprova-se depois do pagamento
    fireEvent.click(screen.getByRole("button", { name: /Aprovar o plano/ }));
    expect(d2.obra.plano!.estado).toBe("aprovado");
    expect(screen.getByText("Plano aprovado")).toBeTruthy();
  });
});

// 11/11 (Rúben: «falta ver quando os técnicos estão ocupados»)
describe("Estúdio do plano: quando os técnicos estão ocupados (11/11)", () => {
  it("na linha do técnico, a barra da outra obra (com o nome) abre o Estúdio dela", () => {
    const { d1 } = montar();
    const barra = screen.getByRole("button", { name: new RegExp(`${TECS[0].n} está noutra obra, ${d1.nome}`) });
    fireEvent.click(barra);
    expect(screen.getAllByRole("heading", { name: new RegExp(d1.nome) }).length).toBeGreaterThan(0);
  });
  it("as férias da ficha aparecem como uma barra «Férias»", () => {
    let nome = "";
    montar(() => { const T = TECS[0]; nome = T.n; T.feriasDatas = ["2027-03-08", "2027-03-09"]; });
    expect(screen.getByRole("img", { name: new RegExp(`${nome} de férias`) })).toBeTruthy();
  });
});
