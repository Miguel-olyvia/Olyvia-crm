import { describe, expect, it } from "vitest";
import {
  barraDe,
  colunaDe,
  deltaDeArrasto,
  montarGantt,
  rotuloDia,
  type FaseGantt,
  type TarefaGantt,
} from "../obras-gantt";

const fases: FaseGantt[] = [
  { id: "f2", ordem: 2, nome: "Instalações técnicas" },
  { id: "f1", ordem: 1, nome: "Preparação e demolições" },
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

const tarefas: TarefaGantt[] = [
  t({ id: "a", ordem: 1, minutosPrevistos: 60, minutosReais: 70, estado: "feita" }),
  t({ id: "b", ordem: 2, minutosPrevistos: 300, minutosReais: 250, inicio: "2026-10-05", fim: "2026-10-06", estado: "em_curso" }),
  t({ id: "c", faseId: "f2", ordem: 1, minutosPrevistos: 600, inicio: "2026-10-08", fim: "2026-10-12" }),
];

describe("montarGantt", () => {
  const g = montarGantt({ fases, tarefas, hoje: "2026-10-07", margem: 1, minimoDias: 5 });

  it("colunas só em dias úteis, com folga de 1 dia de cada lado", () => {
    expect(g.dias[0]).toBe("2026-10-02");
    expect(g.dias[g.dias.length - 1]).toBe("2026-10-13");
    expect(g.dias).not.toContain("2026-10-10");
    expect(g.dias).not.toContain("2026-10-11");
    expect(g.dias).toHaveLength(8);
  });

  it("semanas agrupam de segunda a sexta", () => {
    expect(g.semanas.map((s) => [s.col, s.span])).toEqual([[0, 1], [1, 5], [6, 2]]);
    expect(g.semanas[1].rotulo).toBe("Semana de 5 out");
  });

  it("linha de hoje", () => {
    expect(g.colHoje).toBe(3);
  });

  it("fases por ordem, cada uma seguida das suas tarefas", () => {
    expect(g.linhas.map((l) => (l.tipo === "fase" ? l.fase.id : l.tarefa.id))).toEqual(["f1", "a", "b", "f2", "c"]);
  });

  it("a barra da fase abarca as tarefas e a duração é a soma", () => {
    const f1 = g.linhas[0];
    expect(f1.tipo).toBe("fase");
    if (f1.tipo !== "fase") return;
    expect(f1.barra).toEqual({ col: 1, span: 2 });
    expect(f1.totais.minutosPrevistos).toBe(360);
    expect(f1.totais.minutosReais).toBe(320);
  });

  it("uma barra que atravessa o fim de semana conta só os dias úteis", () => {
    const c = g.linhas.find((l) => l.tipo === "tarefa" && l.tarefa.id === "c");
    expect(c?.barra).toEqual({ col: 4, span: 3 });
  });

  it("gasto e nível de alerta por tarefa", () => {
    const a = g.linhas.find((l) => l.tipo === "tarefa" && l.tarefa.id === "a");
    const b = g.linhas.find((l) => l.tipo === "tarefa" && l.tarefa.id === "b");
    if (a?.tipo !== "tarefa" || b?.tipo !== "tarefa") throw new Error("faltam linhas");
    expect(a.nivel).toBe("excedido");
    expect(a.gasto).toBeCloseTo(70 / 60);
    expect(b.nivel).toBe("aviso");
  });

  it("em atraso: aberta e com o fim planeado já passado", () => {
    const b = g.linhas.find((l) => l.tipo === "tarefa" && l.tarefa.id === "b");
    const a = g.linhas.find((l) => l.tipo === "tarefa" && l.tarefa.id === "a");
    expect(b?.tipo === "tarefa" && b.emAtraso).toBe(true);
    expect(a?.tipo === "tarefa" && a.emAtraso).toBe(false);
  });

  it("fase recolhida esconde as tarefas mas mantém o total", () => {
    const r = montarGantt({ fases, tarefas, hoje: "2026-10-07", recolhidas: new Set(["f1"]) });
    expect(r.linhas.map((l) => (l.tipo === "fase" ? l.fase.id : l.tarefa.id))).toEqual(["f1", "f2", "c"]);
    expect(r.linhas[0].tipo === "fase" && r.linhas[0].recolhida).toBe(true);
  });

  it("obra sem datas desenha uma janela mínima à volta de hoje", () => {
    const r = montarGantt({
      fases,
      tarefas: [t({ id: "x", inicio: null, fim: null })],
      hoje: "2026-10-07",
      minimoDias: 10,
    });
    expect(r.dias).toHaveLength(10);
    expect(r.colHoje).toBe(1);
    const x = r.linhas.find((l) => l.tipo === "tarefa");
    expect(x?.tipo === "tarefa" && x.barra).toBeNull();
  });

  it("hoje ao fim de semana não tem linha", () => {
    expect(montarGantt({ fases, tarefas, hoje: "2026-10-10" }).colHoje).toBeNull();
  });
});

describe("colunas e barras", () => {
  const dias = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-12"];

  it("fim de semana encosta à segunda", () => {
    expect(colunaDe(dias, "2026-10-10")).toBe(5);
  });
  it("antes da janela dá coluna negativa", () => {
    expect(colunaDe(dias, "2026-10-01")).toBe(-2);
  });
  it("barra sem fim ocupa um dia; sem início não há barra", () => {
    expect(barraDe(dias, "2026-10-06", null)).toEqual({ col: 1, span: 1 });
    expect(barraDe(dias, null, "2026-10-06")).toBeNull();
  });
});

describe("arrastar", () => {
  it("converte píxeis em dias úteis, arredondando", () => {
    expect(deltaDeArrasto(0, 40)).toBe(0);
    expect(deltaDeArrasto(19, 40)).toBe(0);
    expect(deltaDeArrasto(21, 40)).toBe(1);
    expect(deltaDeArrasto(-61, 40)).toBe(-2);
    expect(deltaDeArrasto(-10, 40)).toBe(0);
    expect(deltaDeArrasto(100, 0)).toBe(0);
  });
});

describe("rótulos", () => {
  it("dia e semana em português", () => {
    expect(rotuloDia("2026-10-07")).toEqual({ dia: "7", semana: "qua · out" });
  });
});
