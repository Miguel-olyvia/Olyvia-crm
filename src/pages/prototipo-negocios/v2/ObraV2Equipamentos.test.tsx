// A página da obra na V2: os equipamentos (dias reservados, horas reais confirmadas no fecho da tarefa) e a receita contra o real
// ("Usar a mediana" muda a receita pela store dos custos, como o Catálogo; "Desfazer" repõe-a).
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { seed, type Estado, type Papel } from "../motor";
import { OperacoesV2 } from "./OperacoesV2";
import { Montar, primarios } from "./testeV2";
import { lerCustos, reporCustos } from "./custosStore";

beforeEach(() => reporCustos());
afterEach(() => { cleanup(); reporCustos(); });

const abrir = (id = 1022, role: Papel = "operacoes") => {
  const S: Estado = seed(); S.role = role; S.view = "operacoes"; S.op = id;
  const r = render(<Montar S={S}>{(ctx) => <OperacoesV2 {...ctx} />}</Montar>);
  return { S, ...r };
};
const sec = (nome: string) => screen.getByRole("region", { name: nome });

describe("Obra V2 · equipamentos", () => {
  it("lista os equipamentos das receitas, com a tarefa, os dias e as horas previstas", () => {
    abrir();
    const s = sec("Equipamentos");
    const linhas = within(s).getAllByRole("listitem");
    expect(linhas.map((l) => l.querySelector("span span")?.textContent)).toEqual([
      "Carro de mão · Demolição", "Martelo demolidor · Demolição", "Prensa de multicamada · Canalização",
    ]);
    expect(linhas[1]).toHaveTextContent("Usado seg 13/10 · 2 h previstas (Demolição e entulho)");
    expect(linhas[1]).toHaveTextContent("Horas reais por confirmar");
    expect(screen.getByRole("navigation", { name: "Nesta página" })).toHaveTextContent("Equipamentos");
  });
  it("no fecho da tarefa confirma as horas reais na linha (escolher, não escrever); o previsto contra real usa-as", async () => {
    const { container } = abrir();
    const s = sec("Equipamentos");
    const antes = within(sec("Previsto contra real")).getByText("Equipamentos").parentElement!.textContent;
    fireEvent.click(within(s).getByRole("button", { name: "Confirmar as horas: Martelo demolidor, Demolição" }));
    const ed = within(s).getByRole("group", { name: "Horas reais: Martelo demolidor, Demolição" });
    expect(within(ed).getByRole("button", { name: "2 h" })).toHaveAttribute("aria-pressed", "true");
    // um só editor aberto: abrir outro fecha este
    fireEvent.click(within(s).getByRole("button", { name: "Confirmar as horas: Carro de mão, Demolição" }));
    expect(within(s).queryByRole("group", { name: "Horas reais: Martelo demolidor, Demolição" })).toBeNull();
    fireEvent.click(within(s).getByRole("button", { name: "Confirmar as horas: Martelo demolidor, Demolição" }));
    const ed2 = within(s).getByRole("group", { name: "Horas reais: Martelo demolidor, Demolição" });
    fireEvent.click(within(ed2).getByRole("button", { name: "3 h" }));
    fireEvent.click(within(ed2).getByRole("button", { name: "Confirmar 3 h" }));
    expect(within(s).getByText(/3 h reais, confirmadas/)).toBeInTheDocument();
    expect(within(s).getByText(/1 de 3 linhas confirmadas/)).toBeInTheDocument();
    expect(within(sec("Previsto contra real")).getByText("Equipamentos").parentElement!.textContent).not.toBe(antes);
    expect(within(sec("Previsto contra real")).getByText(/1 de 3 confirmadas no fecho/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Martelo demolidor em demolição: 3 h reais confirmadas (previstas 2 h)."));
    expect(primarios(container).map((b) => b.textContent)).toEqual(["Registar o fim da obra"]);
  });
  it("as tarefas por fazer só mostram os dias reservados", () => {
    const { S } = abrir();
    S.deals.find((d) => d.id === 1022)!.obra.plano!.dia = 0;
    cleanup();
    render(<Montar S={S}>{(ctx) => <OperacoesV2 {...ctx} />}</Montar>);
    const s = sec("Equipamentos");
    expect(within(s).getAllByText(/^Reservado /)).toHaveLength(3);
    expect(within(s).queryByRole("button", { name: /^Confirmar as horas/ })).toBeNull();
  });
});

describe("Obra V2 · receita contra o real", () => {
  it("mostra a receita contra a mediana real de cada serviço", () => {
    abrir();
    const s = sec("Receita contra o real");
    expect(s).toHaveTextContent("Revestimento de parede");
    expect(s).toHaveTextContent("Receita 0,75 h/m² · real 0,92 h/m² · +23% na mediana de 5 obras");
    expect(s).toHaveTextContent("Canalização");
    expect(s).toHaveTextContent("bate com a receita (5 obras)");
    expect(within(s).queryByRole("button", { name: /Usar a mediana em Canalização/ })).toBeNull();
  });
  it("Usar a mediana muda a receita (store dos custos, como o Catálogo) e o serviço; Desfazer repõe", async () => {
    const { S, container } = abrir();
    const s = sec("Receita contra o real");
    fireEvent.click(within(s).getByRole("button", { name: "Usar a mediana em Revestimento de parede: 0,92 h/m²" }));
    expect(lerCustos().receitas.revest.origem).toBe("editada");
    expect(S.svc.revest.h).toBe(0.92);
    expect(s).toHaveTextContent("Receita 0,92 h/m² · real 0,92 h/m² · bate com a receita");
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Receita de Revestimento de parede atualizada: 0,75 → 0,92 h/m²"));
    expect(primarios(container)).toHaveLength(1);
    fireEvent.click(within(s).getByRole("button", { name: "Desfazer a receita de Revestimento de parede" }));
    expect(lerCustos().receitas.revest.origem).toBe("catalogo");
    expect(S.svc.revest.h).toBe(0.75);
  });
  it("só as Operações e a Direção mudam a receita", () => {
    abrir(1022, "comercial");
    const s = sec("Receita contra o real");
    expect(within(s).getByRole("button", { name: /^Usar a mediana em Revestimento/ })).toBeDisabled();
    expect(s).toHaveTextContent("Só as Operações e a Direção mudam a receita.");
  });
});
