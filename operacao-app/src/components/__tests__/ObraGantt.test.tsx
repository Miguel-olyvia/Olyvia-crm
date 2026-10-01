import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import ObraGantt from "../ObraGantt";
import type { TarefaGantt } from "../../domain/obras-gantt";

const fases = [
  { id: "f1", ordem: 1, nome: "Preparação e demolições" },
  { id: "f2", ordem: 2, nome: "Instalações técnicas" },
];

const t = (p: Partial<TarefaGantt>): TarefaGantt => ({
  id: "t",
  faseId: "f1",
  ordem: 1,
  nome: "Tarefa",
  estado: "por_fazer",
  minutosPrevistos: 60,
  minutosReais: 0,
  inicio: "2026-10-05",
  fim: "2026-10-05",
  pessoas: [],
  aCorrer: 0,
  dependeDe: null,
  ...p,
});

const tarefas = [
  t({ id: "a", nome: "Demolição de revestimentos", minutosPrevistos: 300, minutosReais: 320, estado: "em_curso" }),
  t({ id: "b", nome: "Canalização", faseId: "f2", inicio: "2026-10-06", fim: "2026-10-07", pessoas: ["u1"] }),
  t({ id: "c", nome: "Validada", faseId: "f2", ordem: 2, estado: "validada", inicio: "2026-10-08", fim: "2026-10-08" }),
];

function montar(extra: Partial<Parameters<typeof ObraGantt>[0]> = {}) {
  const aoSelecionar = vi.fn();
  const aoMudarDatas = vi.fn();
  render(
    <ObraGantt
      fases={fases}
      tarefas={tarefas}
      hoje="2026-10-06"
      podeEditar
      nomes={new Map([["u1", "Ana Silva"]])}
      comConflito={new Set(["b"])}
      selecionada={null}
      aoSelecionar={aoSelecionar}
      aoMudarDatas={aoMudarDatas}
      {...extra}
    />
  );
  return { aoSelecionar, aoMudarDatas };
}

describe("ObraGantt", () => {
  it("mostra fases com a soma do previsto e as tarefas", () => {
    montar();
    expect(screen.getByText("1. Preparação e demolições")).toBeInTheDocument();
    expect(screen.getByText("Demolição de revestimentos")).toBeInTheDocument();
    // Fase 2: 60 + 60 = 2 h
    expect(screen.getAllByTitle("Soma do previsto das tarefas")).toHaveLength(2);
    expect(screen.getAllByText("2 h").length).toBeGreaterThan(0);
  });

  it("assinala o choque de agenda e as iniciais de quem está na tarefa", () => {
    montar();
    expect(screen.getByLabelText("Choque de agenda")).toBeInTheDocument();
    expect(screen.getByText("AS")).toBeInTheDocument();
  });

  it("recolher a fase esconde as tarefas", () => {
    montar();
    fireEvent.click(screen.getByText("1. Preparação e demolições"));
    expect(screen.queryByText("Demolição de revestimentos")).not.toBeInTheDocument();
    expect(screen.getByText("Canalização")).toBeInTheDocument();
  });

  it("clicar no nome abre a ficha", () => {
    const { aoSelecionar } = montar();
    fireEvent.click(screen.getByText("Canalização"));
    expect(aoSelecionar).toHaveBeenCalledWith("b");
  });

  it("arrastar a barra 2 dias para a direita muda as datas em dias úteis", () => {
    const { aoMudarDatas } = montar();
    const barra = screen.getByTitle(/^Canalização —/);
    fireEvent.pointerDown(barra, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(barra, { clientX: 190, pointerId: 1 });
    fireEvent.pointerUp(barra, { clientX: 190, pointerId: 1 });
    // 06–07/10 (ter–qua) + 2 dias úteis = 08–09/10 (qui–sex)
    expect(aoMudarDatas).toHaveBeenCalledWith("b", { inicio: "2026-10-08", fim: "2026-10-09" });
  });

  it("uma tarefa validada não se arrasta", () => {
    const { aoMudarDatas } = montar();
    const barra = screen.getByTitle(/^Validada —/);
    fireEvent.pointerDown(barra, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(barra, { clientX: 300, pointerId: 1 });
    fireEvent.pointerUp(barra, { clientX: 300, pointerId: 1 });
    expect(aoMudarDatas).not.toHaveBeenCalled();
  });

  it("sem permissão de planear, nada se arrasta", () => {
    const { aoMudarDatas } = montar({ podeEditar: false });
    const barra = screen.getByTitle(/^Canalização —/);
    fireEvent.pointerDown(barra, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(barra, { clientX: 300, pointerId: 1 });
    fireEvent.pointerUp(barra, { clientX: 300, pointerId: 1 });
    expect(aoMudarDatas).not.toHaveBeenCalled();
    expect(screen.queryByText(/Arrasta para mudar/)).not.toBeInTheDocument();
  });
});
