import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

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

  it("os nomes (cortados ou não) têm o nome completo no title", () => {
    montar();
    expect(screen.getByTitle("1. Preparação e demolições")).toBeInTheDocument();
    expect(screen.getByTitle("Demolição de revestimentos")).toBeInTheDocument();
  });

  it("marca hoje com uma linha e sombreia os fins de semana na vista Dia", () => {
    const { container } = render(
      <ObraGantt
        fases={fases}
        tarefas={[t({ id: "z", inicio: "2026-10-05", fim: "2026-10-16" })]}
        hoje="2026-10-06"
        podeEditar={false}
        nomes={new Map()}
        comConflito={new Set()}
        selecionada={null}
        aoSelecionar={vi.fn()}
        aoMudarDatas={vi.fn()}
      />
    );
    expect(screen.getByLabelText("Hoje")).toBeInTheDocument();
    expect(container.querySelectorAll("[data-fim-de-semana]").length).toBeGreaterThan(0);
  });
});

describe("ObraGantt — escala", () => {
  it("começa ao dia e troca para semana e mês", () => {
    montar();
    expect(screen.getByRole("button", { name: "Dia" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Semana" }));
    expect(screen.getByRole("button", { name: "Semana" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Sem 41 · 5–9 out")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mês" }));
    expect(screen.getByText("outubro")).toBeInTheDocument();
    expect(screen.queryByText("Sem 41 · 5–9 out")).not.toBeInTheDocument();
  });

  it("lembra a escala escolhida", () => {
    montar();
    fireEvent.click(screen.getByRole("button", { name: "Mês" }));
    expect(localStorage.getItem("operacao-app-gantt-escala")).toBe("mes");
    cleanup();
    montar();
    expect(screen.getByRole("button", { name: "Mês" })).toHaveAttribute("aria-pressed", "true");
  });

  it("ignora uma escala guardada inválida", () => {
    localStorage.setItem("operacao-app-gantt-escala", "ano");
    montar();
    expect(screen.getByRole("button", { name: "Dia" })).toHaveAttribute("aria-pressed", "true");
  });

  it("sem localStorage (bloqueado), funciona na mesma", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    montar();
    fireEvent.click(screen.getByRole("button", { name: "Semana" }));
    expect(screen.getByRole("button", { name: "Semana" })).toHaveAttribute("aria-pressed", "true");
  });

  it("à semana, arrastar encaixa ao dia pelos px por dia", () => {
    const { aoMudarDatas } = montar();
    fireEvent.click(screen.getByRole("button", { name: "Semana" }));
    const barra = screen.getByTitle(/^Canalização —/);
    fireEvent.pointerDown(barra, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(barra, { clientX: 144, pointerId: 1 });
    fireEvent.pointerUp(barra, { clientX: 144, pointerId: 1 });
    expect(aoMudarDatas).toHaveBeenCalledWith("b", { inicio: "2026-10-08", fim: "2026-10-09" });
  });

  it("ao mês, a pega estica ao dia", () => {
    const { aoMudarDatas } = montar();
    fireEvent.click(screen.getByRole("button", { name: "Mês" }));
    const barra = screen.getByTitle(/^Canalização —/);
    const pega = within(barra).getByLabelText("Esticar");
    fireEvent.pointerDown(pega, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(pega, { clientX: 112, pointerId: 1 });
    fireEvent.pointerUp(pega, { clientX: 112, pointerId: 1 });
    // 06–07/10 com o fim + 2 dias úteis = 06–09/10
    expect(aoMudarDatas).toHaveBeenCalledWith("b", { inicio: "2026-10-06", fim: "2026-10-09" });
  });

  it("ao mês, não sombreia fins de semana (não cabem)", () => {
    const { container } = render(
      <ObraGantt
        fases={fases}
        tarefas={tarefas}
        hoje="2026-10-06"
        podeEditar={false}
        nomes={new Map()}
        comConflito={new Set()}
        selecionada={null}
        aoSelecionar={vi.fn()}
        aoMudarDatas={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Mês" }));
    expect(container.querySelectorAll("[data-fim-de-semana]")).toHaveLength(0);
  });
});

describe("ObraGantt — dependências", () => {
  const props = {
    fases,
    hoje: "2026-10-06",
    nomes: new Map<string, string>(),
    comConflito: new Set<string>(),
    selecionada: null,
    aoSelecionar: vi.fn(),
  };

  it("desenha uma seta por dependência de tarefa, a vermelho se a filha começa antes", () => {
    const { container } = render(
      <ObraGantt
        {...props}
        podeEditar={false}
        aoMudarDatas={vi.fn()}
        tarefas={[
          tarefas[0],
          { ...tarefas[1], dependencias: ["a"] },
          // c começa a 08/10 mas depende de b, que acaba a 07/10: ok; e de x, que acaba a 09/10: violada.
          { ...tarefas[2], dependeDe: "b", dependencias: ["b", "x"] },
          t({ id: "x", nome: "Elétrica", faseId: "f2", ordem: 3, inicio: "2026-10-05", fim: "2026-10-09" }),
        ]}
      />
    );
    const setas = Array.from(container.querySelectorAll("[data-seta]")).map((p) => p.getAttribute("data-seta"));
    expect(setas.sort()).toEqual(["a>b", "b>c", "x>c"]);
    expect(container.querySelector('[data-seta="x>c"]')).toHaveAttribute("data-violada", "true");
    expect(container.querySelector('[data-seta="b>c"]')).not.toHaveAttribute("data-violada");
  });

  it("cai para o dependeDe antigo quando não vem `dependencias`", () => {
    const { container } = render(
      <ObraGantt
        {...props}
        podeEditar={false}
        aoMudarDatas={vi.fn()}
        tarefas={[tarefas[0], { ...tarefas[1], dependeDe: "a" }, tarefas[2]]}
      />
    );
    expect(container.querySelectorAll("[data-seta]")).toHaveLength(1);
  });

  it("arrastar para antes do fim da mãe avisa, mas não impede", () => {
    const aoMudarDatas = vi.fn();
    render(
      <ObraGantt
        {...props}
        podeEditar
        aoMudarDatas={aoMudarDatas}
        tarefas={[tarefas[0], { ...tarefas[1], dependencias: ["a"] }, tarefas[2]]}
      />
    );
    const barra = screen.getByTitle(/^Canalização —/);
    fireEvent.pointerDown(barra, { clientX: 200, pointerId: 1 });
    fireEvent.pointerMove(barra, { clientX: 112, pointerId: 1 });
    expect(screen.getByRole("status")).toHaveTextContent("Começa antes de acabar: Demolição de revestimentos");
    fireEvent.pointerUp(barra, { clientX: 112, pointerId: 1 });
    // 06–07/10 − 2 dias úteis = 02–05/10
    expect(aoMudarDatas).toHaveBeenCalledWith("b", { inicio: "2026-10-02", fim: "2026-10-05" });
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("sem aoLigar não há pega de ligar", () => {
    montar();
    expect(screen.queryByRole("button", { name: /^Ligar / })).not.toBeInTheDocument();
  });

  it("arrastar a pega do fim de uma barra para outra tarefa liga-as", () => {
    const aoLigar = vi.fn();
    montar({ aoLigar });
    const pega = screen.getByRole("button", { name: "Ligar Demolição de revestimentos a uma tarefa que depende dela" });
    // Linhas: f1, a, f2, b, c → b é a 4.ª (y = 52 de cabeçalho + 3·40 + 20)
    fireEvent.pointerDown(pega, { clientX: 90, clientY: 52 + 60, pointerId: 3 });
    fireEvent.pointerMove(pega, { clientX: 150, clientY: 192, pointerId: 3 });
    fireEvent.pointerUp(pega, { clientX: 150, clientY: 192, pointerId: 3 });
    expect(aoLigar).toHaveBeenCalledWith("b", "a");
  });

  it("largar numa fase ou na própria tarefa não liga nada", () => {
    const aoLigar = vi.fn();
    montar({ aoLigar });
    const pega = screen.getByRole("button", { name: /^Ligar Demolição/ });
    fireEvent.pointerDown(pega, { clientX: 90, clientY: 112, pointerId: 3 });
    fireEvent.pointerUp(pega, { clientX: 90, clientY: 52 + 100, pointerId: 3 }); // linha da fase f2
    fireEvent.pointerDown(pega, { clientX: 90, clientY: 112, pointerId: 3 });
    fireEvent.pointerUp(pega, { clientX: 90, clientY: 112, pointerId: 3 }); // ela própria
    expect(aoLigar).not.toHaveBeenCalled();
  });

  it("não deixa ligar em ciclo", () => {
    const aoLigar = vi.fn();
    montar({ aoLigar, tarefas: [{ ...tarefas[0], dependencias: ["b"] }, tarefas[1], tarefas[2]] });
    const pega = screen.getByRole("button", { name: /^Ligar Demolição/ });
    fireEvent.pointerDown(pega, { clientX: 90, clientY: 112, pointerId: 3 });
    fireEvent.pointerUp(pega, { clientX: 150, clientY: 192, pointerId: 3 });
    expect(aoLigar).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent(/ficariam à espera uma da outra/);
  });

  it("sem permissão de planear, não há pega de ligar", () => {
    montar({ aoLigar: vi.fn(), podeEditar: false });
    expect(screen.queryByRole("button", { name: /^Ligar / })).not.toBeInTheDocument();
  });
});

describe("ObraGantt — coluna dos nomes", () => {
  const coluna = () => screen.getByRole("separator", { name: "Largura da coluna dos nomes" });
  const largura = () => Number(coluna().getAttribute("aria-valuenow"));

  it("alarga-se a arrastar a pega e lembra a largura", () => {
    montar();
    expect(largura()).toBe(280);
    fireEvent.pointerDown(coluna(), { clientX: 280, pointerId: 7 });
    fireEvent.pointerMove(coluna(), { clientX: 400, pointerId: 7 });
    fireEvent.pointerUp(coluna(), { clientX: 400, pointerId: 7 });
    expect(largura()).toBe(400);
    expect(coluna().parentElement).toHaveStyle({ width: "400px" });
    expect(localStorage.getItem("operacao-app-gantt-largura-nomes")).toBe("400");
    cleanup();
    montar();
    expect(largura()).toBe(400);
  });

  it("não passa do mínimo nem do máximo", () => {
    montar();
    fireEvent.pointerDown(coluna(), { clientX: 280, pointerId: 7 });
    fireEvent.pointerMove(coluna(), { clientX: -500, pointerId: 7 });
    expect(largura()).toBe(160);
    fireEvent.pointerMove(coluna(), { clientX: 5000, pointerId: 7 });
    expect(largura()).toBe(640);
    fireEvent.pointerUp(coluna(), { clientX: 5000, pointerId: 7 });
  });

  it("também se ajusta pelo teclado", () => {
    montar();
    fireEvent.keyDown(coluna(), { key: "ArrowRight" });
    expect(largura()).toBe(296);
    fireEvent.keyDown(coluna(), { key: "ArrowLeft", shiftKey: true });
    expect(largura()).toBe(232);
  });

  it("duplo clique sem layout (jsdom) não estraga a largura", () => {
    montar();
    fireEvent.doubleClick(coluna());
    expect(largura()).toBe(280);
  });
});
