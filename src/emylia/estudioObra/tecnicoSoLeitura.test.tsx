// 23/11 (permissões: «o técnico pode ver a operação mas não clicar em nada porque isso é do gestor de obra»). Sem negocios.obra.planear o
// Estúdio da obra é só de leitura: vê o plano, os alertas, os imprevistos e os separadores, sem nenhum botão que mude a obra.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { acoes } from "../motor";
import type { Ctx } from "../pecas";
import { EstudioObra } from "./EstudioObra";
import { obraDeExemplo } from "./exemploObra";

afterEach(cleanup);

function montar(role: "tecnico" | "operacoes") {
  const { S, d } = obraDeExemplo();
  S.role = role;
  const A = acoes(S, () => {}, (fn) => fn());
  const ctx = { S, A, run: (fn: () => void) => { fn(); r.rerender(<EstudioObra ctx={ctx} d={d} fechar={() => {}} />); }, go: (fn: () => void) => () => fn(), q: "" } as unknown as Ctx;
  const r = render(<EstudioObra ctx={ctx} d={d} fechar={() => {}} />);
  return { S, d };
}

describe("Estúdio da obra sem obra.planear (23/11)", () => {
  it("o técnico vê o plano e os alertas, sem botões de ação", () => {
    montar("tecnico");
    expect(screen.getByRole("region", { name: "O plano vivo" })).toBeTruthy();
    const alertas = screen.getByRole("region", { name: "Alertas" });
    expect(within(alertas).getByRole("group", { name: /Revestimento de parede está atrasada/ })).toBeTruthy();
    expect(within(alertas).queryAllByRole("button")).toHaveLength(0);
    const topo = screen.getByRole("banner");
    expect(within(topo).queryByRole("button", { name: /Validar/ })).toBeNull();
    expect(within(topo).queryByRole("button", { name: "Replanear" })).toBeNull();
    expect(within(topo).queryByRole("button", { name: "Registar imprevisto" })).toBeNull();
    expect(within(screen.getByRole("region", { name: "Imprevistos" })).queryByRole("button", { name: /Registar/ })).toBeNull();
  });
  it("a tarefa abre para ler, sem validar, atrasar nem registar imprevisto", () => {
    montar("tecnico");
    fireEvent.click(screen.getByRole("button", { name: /^Pavimento cerâmico: parada/ }));
    const painel = screen.getByRole("complementary", { name: "A tarefa" });
    expect(within(painel).queryByRole("button", { name: "Ver no plano" })).toBeNull();
    expect(within(painel).queryByRole("button", { name: /Registar um imprevisto/ })).toBeNull();
    expect(screen.queryByRole("region", { name: "Antes de aplicar" })).toBeNull();
  });
  it("os separadores lêem-se: o Cliente sem escrever e o Fecho sem mudar a vistoria", () => {
    montar("tecnico");
    fireEvent.click(screen.getByRole("tab", { name: /Cliente/ }));
    expect(screen.queryByRole("region", { name: "Avisar o cliente" })).toBeNull();
    expect(screen.queryByRole("region", { name: "O ponto da semana" })).toBeNull();
    expect(screen.queryByLabelText("Escrever uma mensagem")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: /Fecho/ }));
    expect(screen.queryByLabelText(/Data da vistoria/)).toBeNull();
    expect(screen.getByText(/Data da vistoria:/)).toBeTruthy();
  });
  it("quem planeia (Operações) fica igual", () => {
    montar("operacoes");
    const alertas = screen.getByRole("region", { name: "Alertas" });
    expect(within(alertas).getByRole("button", { name: "Prolongar até hoje" })).toBeTruthy();
    const topo = screen.getByRole("banner");
    expect(within(topo).getByRole("button", { name: /Validar a tarefa feita/ })).toBeTruthy();
    expect(within(topo).getByRole("button", { name: "Replanear" })).toBeTruthy();
    expect(within(topo).getByRole("button", { name: "Registar imprevisto" })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /Cliente/ }));
    expect(screen.getByRole("region", { name: "Avisar o cliente" })).toBeTruthy();
    expect(screen.getByLabelText("Escrever uma mensagem")).toBeTruthy();
  });
});
