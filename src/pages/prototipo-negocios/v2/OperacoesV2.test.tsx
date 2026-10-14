// O ecrã de Operações da V2: o Hoje do supervisor, a lista das obras e a página de uma obra (Plano, Validar, Atrasos, Previsto contra real, Materiais).
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { acoes, seed, type Estado } from "../motor";
import { OperacoesV2 } from "./OperacoesV2";
import { Montar, primarios } from "./testeV2";

afterEach(cleanup);

const montar = (S: Estado) => render(<Montar S={S}>{(ctx) => <OperacoesV2 {...ctx} />}</Montar>);
const operacoes = () => { const S = seed(); S.role = "operacoes"; S.view = "operacoes"; return S; };
const sec = (nome: string) => screen.getByRole("region", { name: nome });

describe("Operações V2 · lista e Hoje do supervisor", () => {
  it("o Hoje mostra as tarefas por validar e os atrasos, cada uma uma vez, e a lista tem o estado em texto", () => {
    const { container } = montar(operacoes());
    const hoje = sec("Hoje");
    expect(within(hoje).getByRole("heading", { name: "Por validar (2)" })).toBeInTheDocument();
    expect(within(hoje).getByRole("heading", { name: "Atrasos (1)" })).toBeInTheDocument();
    expect(within(hoje).getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Demolição · Marta LimaFeita seg 13/10", "Canalização · Marta LimaFeita ter 14/10", "Revestimento e pavimento · Marta Lima1 dia · Material em falta · cliente por avisar",
    ]);
    const obras = sec("Obras");
    expect(within(obras).getByText("Em curso")).toBeInTheDocument();
    expect(within(obras).getByText("Concluída")).toBeInTheDocument();
    expect(primarios(container)).toHaveLength(0);
  });
  it("um item do Hoje abre a obra", () => {
    const S = operacoes();
    montar(S);
    fireEvent.click(within(sec("Hoje")).getAllByRole("button")[0]);
    expect(S.op).toBe(1022);
    expect(screen.getByRole("heading", { level: 1, name: "Marta Lima" })).toBeInTheDocument();
  });
});

describe("Operações V2 · a página da obra", () => {
  const abrir = () => { const S = operacoes(); S.op = 1022; const r = montar(S); return { S, ...r }; };

  it("tem as cinco secções seguidas, sem separadores, e um só botão primário", () => {
    const { container } = abrir();
    for (const n of ["Plano", "Validar", "Atrasos", "Previsto contra real", "Materiais"]) expect(sec(n)).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(primarios(container).map((b) => b.textContent)).toEqual(["Registar o fim da obra"]);
    expect(within(sec("Previsto contra real")).getByText("O real é de exemplo")).toBeInTheDocument();
    expect(within(sec("Previsto contra real")).getByText("Mão de obra")).toBeInTheDocument();
  });

  it("valida uma tarefa, rejeita outra com o motivo escrito na linha (sem modal), e o Hoje acompanha", () => {
    const { S } = abrir();
    const v = sec("Validar");
    fireEvent.click(within(v).getByRole("button", { name: "Validar Demolição" }));
    expect(within(v).queryByRole("button", { name: "Validar Demolição" })).toBeNull();
    fireEvent.click(within(v).getByRole("button", { name: "Rejeitar Canalização" }));
    fireEvent.click(within(v).getByRole("button", { name: "Rejeitar tarefa" }));
    expect(within(v).getByRole("alert")).toHaveTextContent(/motivo/);
    fireEvent.change(within(v).getByLabelText("Motivo"), { target: { value: "Fuga na ligação do lavatório" } });
    fireEvent.click(within(v).getByRole("button", { name: "Rejeitar tarefa" }));
    expect(within(v).getByText(/rejeitada: Fuga na ligação do lavatório/)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
    // de volta à lista: já não há nada por validar no Hoje
    fireEvent.click(screen.getByRole("button", { name: "Operações" }));
    expect(S.op).toBeNull();
    expect(within(sec("Hoje")).queryByRole("heading", { name: /Por validar/ })).toBeNull();
  });

  it("validar todas de uma vez", () => {
    abrir();
    fireEvent.click(within(sec("Validar")).getByRole("button", { name: "Validar todas (2)" }));
    expect(within(sec("Validar")).getByText(/Nada por validar\. 2 tarefas validadas\./)).toBeInTheDocument();
  });

  it("regista um atraso na linha, com o motivo em botões e o cliente avisado", () => {
    abrir();
    const a = sec("Atrasos");
    fireEvent.click(within(a).getByRole("button", { name: "Registar um atraso" }));
    fireEvent.click(within(a).getByRole("button", { name: "2 dias" }));
    fireEvent.click(within(a).getByRole("button", { name: "Chuva" }));
    fireEvent.click(within(a).getByRole("switch", { name: "Cliente avisado" }));
    fireEvent.click(within(a).getByRole("button", { name: "Registar atraso" }));
    expect(within(a).getByText("Revestimento e pavimento · 2 dias")).toBeInTheDocument();
    expect(within(a).getAllByRole("switch").map((s) => s.getAttribute("aria-checked"))).toEqual(["false", "true"]);
  });

  it("sem ser das Operações, vê tudo mas não age", () => {
    const S = seed(); S.view = "operacoes"; S.op = 1022; // comercial
    const { container } = montar(S);
    expect(screen.getByText(/Esta página é de Filipe · Operações/)).toBeInTheDocument();
    expect(primarios(container)[0]).toBeDisabled();
    expect(within(sec("Validar")).getByRole("button", { name: "Validar Demolição" })).toBeDisabled();
  });
});

describe("Operações V2 · plano por aprovar", () => {
  it("o supervisor e o início escolhem-se na linha; com o conflito resolvido, Aprovar plano", () => {
    const S = operacoes();
    const d = S.deals.find((x) => x.id === 1027)!;
    Object.assign(d.f, { conta: "Banco B · conta obras", comprovativo: "TRF 1" });
    d.obra.ec = null; d.obra.plano = null; // o circuito antigo (o plano das 4 fases, com as férias do Sérgio)
    acoes(S, () => {}, (fn) => fn()).validar(1027); // o recibo põe a obra a andar: plano por aprovar
    expect(d.obra.plano!.estado).toBe("por aprovar");
    S.op = 1027;
    const { container } = montar(S);
    const pl = sec("Plano");
    expect(within(pl).getByText(/Plano por aprovar\. Falta resolver o conflito\./)).toBeInTheDocument();
    const aprovar = within(pl).getByRole("button", { name: "Aprovar plano" });
    expect(aprovar).toBeDisabled();
    expect(primarios(container)).toEqual([aprovar]);
    fireEvent.click(within(pl).getByRole("button", { name: "Hugo" }));
    expect(within(pl).getByRole("button", { name: "Hugo" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(pl).getByRole("button", { name: "qua 15/10" }));
    fireEvent.click(within(pl).getByRole("button", { name: /^Trocar por/ }));
    fireEvent.click(within(sec("Plano")).getByRole("button", { name: "Aprovar plano" }));
    expect(d.obra.plano!.estado).toBe("aprovado");
    expect(d.f.responsavel).toBe("Hugo");
    expect(d.f.inicio).toBe("2026-10-15");
  });
});
