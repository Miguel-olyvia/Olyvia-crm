import { describe, expect, it } from "vitest";
import {
  dataCurta,
  diasUteisDeAtraso,
  planoMudou,
  resumoAtrasos,
  segmentoAlemDoOriginal,
  tarefaAtrasada,
  textoAtraso,
  textoResumoAtrasos,
} from "../obras-gantt";
import {
  avisosDeDependencia,
  barraDe,
  cabecalhoGantt,
  caminhoSeta,
  colunaDe,
  colunaDeX,
  criaCiclo,
  dataDeX,
  deltaDeArrasto,
  dependenciasDe,
  setasDependencia,
  tarefaNaPosicao,
  textoAvisoDependencia,
  violaDependencia,
  ehEscalaGantt,
  geometriaBarra,
  juntasDeFimDeSemana,
  larguraAjustadaAosNomes,
  limitarLarguraNomes,
  montarGantt,
  pxPorDia,
  rotuloDia,
  rotuloSemanaCurto,
  semanaIso,
  xDeColuna,
  xDeData,
  xHoje,
  type FaseGantt,
  type TarefaGantt,
} from "../obras-gantt";
import { diasUteisEntre } from "../obras";

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

describe("escalas", () => {
  it("px por dia: o dia é o mais largo, o mês o mais estreito", () => {
    expect(pxPorDia("dia")).toBe(44);
    expect(pxPorDia("semana")).toBeLessThan(pxPorDia("dia"));
    expect(pxPorDia("mes")).toBeLessThan(pxPorDia("semana"));
    expect(pxPorDia("mes")).toBeGreaterThan(0);
  });

  it("reconhece só as escalas válidas (para o que vem do localStorage)", () => {
    expect(ehEscalaGantt("semana")).toBe(true);
    expect(ehEscalaGantt("ano")).toBe(false);
    expect(ehEscalaGantt(null)).toBe(false);
  });

  it("vista Semana: a janela vai de segunda a sexta, semanas inteiras", () => {
    const g = montarGantt({ fases, tarefas, hoje: "2026-10-07", minimoDias: 5, escala: "semana" });
    expect(g.dias[0]).toBe("2026-09-28");
    expect(g.dias[g.dias.length - 1]).toBe("2026-10-16");
    expect(g.dias).toHaveLength(15);
    expect(g.colHoje).toBe(7);
  });

  it("vista Semana: por omissão mostra pelo menos 4 semanas", () => {
    const g = montarGantt({ fases, tarefas, hoje: "2026-10-07", escala: "semana" });
    expect(g.dias.length).toBeGreaterThanOrEqual(20);
    expect(g.dias.length % 5).toBe(0);
  });

  it("vista Mês: a janela vai do primeiro ao último dia útil do mês", () => {
    const g = montarGantt({ fases, tarefas, hoje: "2026-10-07", escala: "mes" });
    expect(g.dias[0]).toBe("2026-10-01");
    expect(g.dias[g.dias.length - 1]).toBe("2026-11-30");
  });

  it("as barras não mudam de coluna entre escalas que começam no mesmo dia", () => {
    const g = montarGantt({ fases, tarefas, hoje: "2026-10-07", escala: "mes" });
    const c = g.linhas.find((l) => l.tipo === "tarefa" && l.tarefa.id === "c");
    // 08/10 é o 6.º dia útil de outubro; 08–12/10 são 3 dias úteis.
    expect(c?.barra).toEqual({ col: 5, span: 3 });
  });
});

describe("semana ISO", () => {
  it("numera como o calendário europeu", () => {
    expect(semanaIso("2026-10-05")).toBe(41);
    expect(semanaIso("2026-10-09")).toBe(41);
    expect(semanaIso("2026-01-01")).toBe(1);
    expect(semanaIso("2021-01-01")).toBe(53);
    expect(semanaIso("2024-12-30")).toBe(1);
  });

  it("rótulo curto com o intervalo de dias", () => {
    expect(rotuloSemanaCurto("2026-10-05", "2026-10-09")).toBe("Sem 41 · 5–9 out");
    expect(rotuloSemanaCurto("2026-09-28", "2026-10-02")).toBe("Sem 40 · 28 set–2 out");
    expect(rotuloSemanaCurto("2026-10-09", "2026-10-09")).toBe("Sem 41 · 9 out");
  });
});

describe("cabeçalho por escala", () => {
  it("Dia: semanas por cima, um dia por coluna", () => {
    const dias = diasUteisEntre("2026-10-02", "2026-10-13");
    const c = cabecalhoGantt(dias, "dia", "2026-10-07");
    expect(c.topo.map((s) => [s.col, s.span, s.rotulo])).toEqual([
      [0, 1, "Semana de 2 out"],
      [1, 5, "Semana de 5 out"],
      [6, 2, "Semana de 12 out"],
    ]);
    expect(c.base).toHaveLength(8);
    expect(c.base[3]).toMatchObject({ col: 3, span: 1, rotulo: "7", sub: "qua", titulo: "2026-10-07", hoje: true });
    expect(c.base.filter((b) => b.hoje)).toHaveLength(1);
  });

  it("Semana: 'Sem 41 · 5–9 out' por cima e dias compactos", () => {
    const dias = diasUteisEntre("2026-09-28", "2026-10-16");
    const c = cabecalhoGantt(dias, "semana", "2026-10-07");
    expect(c.topo.map((s) => [s.col, s.span, s.rotulo])).toEqual([
      [0, 5, "Sem 40 · 28 set–2 out"],
      [5, 5, "Sem 41 · 5–9 out"],
      [10, 5, "Sem 42 · 12–16 out"],
    ]);
    expect(c.topo.map((s) => s.hoje)).toEqual([false, true, false]);
    expect(c.base[7]).toMatchObject({ rotulo: "7", sub: "Q", hoje: true });
  });

  it("Semana: hoje ao sábado ainda marca a semana", () => {
    const dias = diasUteisEntre("2026-10-05", "2026-10-16");
    const c = cabecalhoGantt(dias, "semana", "2026-10-10");
    expect(c.topo.map((s) => s.hoje)).toEqual([true, false]);
    expect(c.base.some((b) => b.hoje)).toBe(false);
  });

  it("Mês: uma coluna por mês, proporcional aos dias úteis", () => {
    const dias = diasUteisEntre("2026-10-01", "2026-11-30");
    const c = cabecalhoGantt(dias, "mes", "2026-10-07");
    expect(c.topo).toEqual([{ col: 0, span: 43, rotulo: "2026", titulo: "2026", hoje: true }]);
    expect(c.base).toEqual([
      { col: 0, span: 22, rotulo: "outubro", titulo: "outubro 2026", hoje: true },
      { col: 22, span: 21, rotulo: "novembro", titulo: "novembro 2026", hoje: false },
    ]);
  });

  it("Mês: muda de ano", () => {
    const c = cabecalhoGantt(diasUteisEntre("2026-12-28", "2027-01-08"), "mes");
    expect(c.topo.map((s) => s.rotulo)).toEqual(["2026", "2027"]);
    expect(c.base.map((s) => [s.rotulo, s.span])).toEqual([["dezembro", 4], ["janeiro", 6]]);
  });
});

describe("posição ↔ data", () => {
  const dias = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-12"];

  it("coluna ↔ píxel", () => {
    expect(xDeColuna(3, 44)).toBe(132);
    expect(colunaDeX(131, 44)).toBe(2);
    expect(colunaDeX(132, 44)).toBe(3);
    expect(colunaDeX(-1, 6)).toBe(-1);
    expect(colunaDeX(50, 0)).toBe(0);
  });

  it("data ↔ píxel, em qualquer escala", () => {
    expect(xDeData(dias, "2026-10-08", 44)).toBe(132);
    expect(xDeData(dias, "2026-10-08", 6)).toBe(18);
    expect(xDeData(dias, "2026-10-10", 22)).toBe(110); // sábado → segunda
    expect(dataDeX(dias, 0, 44)).toBe("2026-10-05");
    expect(dataDeX(dias, 45, 44)).toBe("2026-10-06");
    expect(dataDeX(dias, 19, 6)).toBe("2026-10-08");
    for (const d of dias) expect(dataDeX(dias, xDeData(dias, d, 6), 6)).toBe(d);
  });

  it("fora da janela conta dias úteis a partir das pontas", () => {
    expect(dataDeX(dias, -1, 44)).toBe("2026-10-02");
    expect(dataDeX(dias, 6 * 44, 44)).toBe("2026-10-13");
    expect(dataDeX([], 0, 44)).toBeNull();
  });

  it("arrastar na vista Mês encaixa ao dia pelos px por dia", () => {
    expect(deltaDeArrasto(13, pxPorDia("mes"))).toBe(2);
    expect(deltaDeArrasto(44, pxPorDia("semana"))).toBe(2);
  });

  it("linha de hoje: a meio do dia; ao fim de semana, na junta; fora, nada", () => {
    expect(xHoje(dias, "2026-10-07", 44)).toBe(110);
    expect(xHoje(dias, "2026-10-07", 6)).toBe(15);
    expect(xHoje(dias, "2026-10-10", 44)).toBe(220);
    expect(xHoje(dias, "2026-10-17", 44)).toBeNull();
    expect(xHoje(dias, "2026-10-20", 44)).toBeNull();
    expect(xHoje(dias, "2026-10-03", 44)).toBeNull();
  });

  it("juntas de fim de semana: a coluna a seguir a cada salto", () => {
    expect(juntasDeFimDeSemana(dias)).toEqual([5]);
    expect(juntasDeFimDeSemana(diasUteisEntre("2026-09-28", "2026-10-16"))).toEqual([5, 10]);
    expect(juntasDeFimDeSemana([])).toEqual([]);
  });

  it("geometria da barra com folga e largura mínima", () => {
    expect(geometriaBarra({ col: 1, span: 3 }, 44, 2)).toEqual({ left: 46, width: 128 });
    expect(geometriaBarra({ col: 2, span: 1 }, 6, 1)).toEqual({ left: 13, width: 8 });
    expect(geometriaBarra({ col: -2, span: 10 }, 6, 1)).toEqual({ left: -11, width: 58 });
  });
});

describe("dependências entre tarefas (micro, não fases)", () => {
  // a → b (legado, dependeDe) · b → c (fases diferentes) · c → d (d começa antes de c acabar)
  const comDeps: TarefaGantt[] = [
    t({ id: "a", nome: "A", ordem: 1 }),
    t({ id: "b", nome: "B", ordem: 2, inicio: "2026-10-05", fim: "2026-10-06", dependeDe: "a" }),
    t({ id: "c", nome: "C", faseId: "f2", ordem: 1, inicio: "2026-10-08", fim: "2026-10-12", dependencias: ["b"] }),
    t({ id: "d", nome: "D", faseId: "f2", ordem: 2, inicio: "2026-10-09", fim: "2026-10-09", dependencias: ["c"] }),
  ];

  it("usa `dependencias` se vier; senão o `dependeDe` antigo; sem repetidos nem a própria", () => {
    expect(dependenciasDe({ id: "x", dependeDe: "a", dependencias: ["b", "c", "b", "x"] })).toEqual(["b", "c"]);
    expect(dependenciasDe({ id: "x", dependeDe: "a" })).toEqual(["a"]);
    expect(dependenciasDe({ id: "x", dependeDe: null })).toEqual([]);
    expect(dependenciasDe({ id: "x", dependeDe: "a", dependencias: [] })).toEqual([]);
  });

  it("violada só se começa antes do dia em que a mãe acaba; sem datas não avisa", () => {
    expect(violaDependencia({ inicio: "2026-10-05", fim: "2026-10-07" }, { inicio: "2026-10-06" })).toBe(true);
    expect(violaDependencia({ inicio: "2026-10-05", fim: "2026-10-07" }, { inicio: "2026-10-07" })).toBe(false);
    expect(violaDependencia({ inicio: "2026-10-05", fim: null }, { inicio: "2026-10-02" })).toBe(true);
    expect(violaDependencia({ inicio: null, fim: null }, { inicio: "2026-10-02" })).toBe(false);
    expect(violaDependencia({ inicio: "2026-10-05", fim: "2026-10-07" }, { inicio: null })).toBe(false);
  });

  it("avisos ao mudar datas: mães por acabar e filhas que ficam a começar cedo", () => {
    // Mover c para 05–06/10: começa antes de b acabar (06/10) e d (09/10) já não fica depois.
    const av = avisosDeDependencia(comDeps, "c", { inicio: "2026-10-05", fim: "2026-10-06" });
    expect(av.map((a) => [a.tipo, a.tarefa.id])).toEqual([["mae", "b"]]);
    const av2 = avisosDeDependencia(comDeps, "c", { inicio: "2026-10-07", fim: "2026-10-14" });
    expect(av2.map((a) => [a.tipo, a.tarefa.id])).toEqual([["filha", "d"]]);
    expect(avisosDeDependencia(comDeps, "c", { inicio: "2026-10-07", fim: "2026-10-08" })).toEqual([]);
    expect(avisosDeDependencia(comDeps, "zz", { inicio: "2026-10-07", fim: "2026-10-08" })).toEqual([]);
  });

  it("texto do aviso", () => {
    const av = avisosDeDependencia(comDeps, "c", { inicio: "2026-10-05", fim: "2026-10-14" });
    expect(textoAvisoDependencia(av)).toBe("Começa antes de acabar: B · D começa antes de esta acabar");
    expect(textoAvisoDependencia([])).toBeNull();
  });

  it("não deixa fechar ciclos", () => {
    expect(criaCiclo(comDeps, "a", "d")).toBe(true); // d → c → b → a
    expect(criaCiclo(comDeps, "a", "a")).toBe(true);
    expect(criaCiclo(comDeps, "d", "a")).toBe(false);
    expect(criaCiclo(comDeps, "b", "c")).toBe(true);
  });

  it("caminho em cotovelo; se a filha começa antes, dá a volta pela junta", () => {
    expect(caminhoSeta(130, 100, 178, 180, 40)).toBe("M 130 100 H 136 V 180 H 178");
    expect(caminhoSeta(306, 180, 222, 220, 40)).toBe("M 306 180 H 312 V 200 H 216 V 220 H 222");
    expect(caminhoSeta(306, 220, 222, 180, 40)).toBe("M 306 220 H 312 V 200 H 216 V 180 H 222");
  });

  const g = montarGantt({ fases, tarefas: comDeps, hoje: "2026-10-07", minimoDias: 5 });

  it("setas do fim da mãe ao início da filha, mesmo entre fases; vermelho se violada", () => {
    const s = setasDependencia({ linhas: g.linhas, ppd: 44, alturaLinha: 40, folga: 2 });
    expect(s.map((x) => [x.de, x.para, x.violada])).toEqual([
      ["a", "b", false],
      ["b", "c", false],
      ["c", "d", true],
    ]);
    expect(s[1].caminho).toBe("M 130 100 H 136 V 180 H 178");
    expect(s[2].caminho).toBe("M 306 180 H 312 V 200 H 216 V 220 H 222");
  });

  it("as setas escalam com os px por dia", () => {
    const s = setasDependencia({ linhas: g.linhas, ppd: 6, alturaLinha: 40, folga: 1 });
    // b: col 1, span 2 → acaba em 1·6+1+max(8,10) = 17; c começa em 4·6+1 = 25 (perto: dá a volta)
    expect(s[1].caminho).toBe("M 17 100 H 23 V 160 H 19 V 180 H 25");
    expect(setasDependencia({ linhas: g.linhas, ppd: 22, alturaLinha: 40, folga: 1 })[1].caminho).toBe(
      "M 65 100 H 71 V 180 H 89"
    );
  });

  it("acompanham o arrasto antes de gravar", () => {
    const s = setasDependencia({
      linhas: g.linhas,
      ppd: 44,
      alturaLinha: 40,
      folga: 2,
      ajuste: { id: "d", barra: { col: 7, span: 1 }, intervalo: { inicio: "2026-10-13", fim: "2026-10-13" } },
    });
    expect(s.find((x) => x.para === "d")?.violada).toBe(false);
  });

  it("fase recolhida esconde as setas das suas tarefas", () => {
    const r = montarGantt({ fases, tarefas: comDeps, hoje: "2026-10-07", minimoDias: 5, recolhidas: new Set(["f2"]) });
    const s = setasDependencia({ linhas: r.linhas, ppd: 44, alturaLinha: 40, folga: 2 });
    expect(s.map((x) => `${x.de}>${x.para}`)).toEqual(["a>b"]);
  });

  it("que tarefa está sob o ponteiro (para ligar)", () => {
    // linhas: f1, a, b, f2, c, d
    expect(tarefaNaPosicao(g.linhas, 45, 40)).toBe("a");
    expect(tarefaNaPosicao(g.linhas, 20, 40)).toBeNull(); // fase
    expect(tarefaNaPosicao(g.linhas, 219, 40)).toBe("d");
    expect(tarefaNaPosicao(g.linhas, 10_000, 40)).toBeNull();
    expect(tarefaNaPosicao(g.linhas, -1, 40)).toBeNull();
  });
});

describe("coluna dos nomes", () => {
  it("limita a largura entre o mínimo e o máximo", () => {
    expect(limitarLarguraNomes(100)).toBe(160);
    expect(limitarLarguraNomes(10_000)).toBe(640);
    expect(limitarLarguraNomes(300.4)).toBe(300);
    expect(limitarLarguraNomes(Number.NaN)).toBe(280);
  });

  it("duplo clique: alarga até caber o nome mais comprido", () => {
    expect(
      larguraAjustadaAosNomes(280, [
        { ocupado: 200, natural: 350 },
        { ocupado: 200, natural: 120 },
      ])
    ).toBe(434);
  });

  it("duplo clique: também encolhe se os nomes forem curtos, sem passar o mínimo", () => {
    expect(larguraAjustadaAosNomes(400, [{ ocupado: 320, natural: 150 }])).toBe(234);
    expect(larguraAjustadaAosNomes(280, [{ ocupado: 200, natural: 10 }])).toBe(160);
  });

  it("sem medidas (sem layout), fica como está", () => {
    expect(larguraAjustadaAosNomes(300, [])).toBe(300);
    expect(larguraAjustadaAosNomes(300, [{ ocupado: 0, natural: 0 }])).toBe(300);
  });
});

describe("plano original e atrasos", () => {
  it("planoMudou só quando há original e difere do atual", () => {
    expect(planoMudou(t({}))).toBe(false);
    expect(planoMudou(t({ inicioOriginal: "2026-10-05", fimOriginal: "2026-10-05" }))).toBe(false);
    expect(planoMudou(t({ inicioOriginal: "2026-10-05", fimOriginal: "2026-10-02", fim: "2026-10-05" }))).toBe(true);
    expect(planoMudou(t({ fimOriginal: "2026-10-06" }))).toBe(true);
  });

  it("diasUteisDeAtraso conta dias úteis entre fins (fins de semana não contam)", () => {
    // sex 9 out → ter 13 out: 2 dias úteis
    expect(diasUteisDeAtraso("2026-10-09", "2026-10-13")).toBe(2);
    expect(diasUteisDeAtraso("2026-10-13", "2026-10-09")).toBe(-2);
    expect(diasUteisDeAtraso("2026-10-09", "2026-10-09")).toBe(0);
    // sábado encosta à segunda
    expect(diasUteisDeAtraso("2026-10-10", "2026-10-12")).toBe(0);
    expect(diasUteisDeAtraso(null, "2026-10-12")).toBe(0);
    expect(diasUteisDeAtraso("2026-10-12", undefined)).toBe(0);
  });

  it("segmentoAlemDoOriginal: a parte da barra depois do fim original, em px, em cada escala", () => {
    const dias = diasUteisEntre("2026-10-05", "2026-10-16");
    // barra 5–9 out (col 0, 5 colunas); original acabava a 7 (col 2)
    const barra = { col: 0, span: 5 };
    for (const ppd of [44, 22, 6]) {
      const seg = segmentoAlemDoOriginal({ dias, barra, fimOriginal: "2026-10-07", ppd, folga: 1 });
      expect(seg).toEqual({ left: 3 * ppd - 1, width: 5 * ppd - 1 - (3 * ppd - 1) });
    }
    expect(segmentoAlemDoOriginal({ dias, barra, fimOriginal: "2026-10-09", ppd: 44, folga: 2 })).toBeNull();
    expect(segmentoAlemDoOriginal({ dias, barra, fimOriginal: "2026-10-14", ppd: 44, folga: 2 })).toBeNull();
    expect(segmentoAlemDoOriginal({ dias, barra, fimOriginal: null, ppd: 44, folga: 2 })).toBeNull();
    // original acaba antes do início atual: a barra toda está além
    expect(
      segmentoAlemDoOriginal({ dias, barra: { col: 5, span: 2 }, fimOriginal: "2026-10-06", ppd: 44, folga: 2 })
    ).toEqual({ left: 5 * 44 + 2, width: 2 * 44 - 4 });
  });

  it("montarGantt dá a barra original quando o plano mudou e alarga a janela para a incluir", () => {
    const l = montarGantt({
      fases: [{ id: "f1", ordem: 1, nome: "F" }],
      tarefas: [t({ id: "x", inicio: "2026-10-12", fim: "2026-10-13", inicioOriginal: "2026-10-01", fimOriginal: "2026-10-02" })],
      hoje: "2026-10-12",
    });
    expect(l.dias[0] <= "2026-10-01").toBe(true);
    const linha = l.linhas.find((x) => x.tipo === "tarefa");
    expect(linha?.tipo === "tarefa" && linha.barraOriginal).toEqual({ col: l.dias.indexOf("2026-10-01"), span: 2 });
    const igual = montarGantt({ fases: [{ id: "f1", ordem: 1, nome: "F" }], tarefas: [t({ id: "y" })], hoje: "2026-10-05" });
    const ly = igual.linhas.find((x) => x.tipo === "tarefa");
    expect(ly?.tipo === "tarefa" && ly.barraOriginal).toBeNull();
  });

  it("textoAtraso descreve o último atraso", () => {
    const atraso = { motivo: "secagem", contexto: "parede ainda húmida", minutosExtra: null, clienteAvisado: true, n: 1 };
    expect(textoAtraso(t({ fimOriginal: "2026-10-05", fim: "2026-10-07", atraso }))).toBe(
      "Atrasada +2 dias — Secagem: parede ainda húmida (cliente avisado)"
    );
    expect(
      textoAtraso(t({ fim: "2026-10-05", atraso: { ...atraso, minutosExtra: 90, clienteAvisado: false, n: 3 } }))
    ).toBe("Atrasada +1 h 30 min — Secagem: parede ainda húmida (cliente por avisar) · 3 atrasos registados");
    expect(
      textoAtraso(t({ fimOriginal: "2026-10-05", fim: "2026-10-06", atraso: { ...atraso, motivo: "falta_material", contexto: "" } }))
    ).toBe("Atrasada +1 dia — Falta material (cliente avisado)");
    expect(textoAtraso(t({}))).toBeNull();
  });

  it("resumoAtrasos: null sem dados; senão fim previsto vs original e contagens", () => {
    expect(resumoAtrasos([t({}), t({ id: "b" })])).toBeNull();
    const atraso = { motivo: "x", contexto: "", minutosExtra: null, clienteAvisado: false, n: 1 };
    const lista = [
      t({ id: "a", fim: "2026-10-23", fimOriginal: "2026-10-19", atraso }),
      t({ id: "b", fim: "2026-10-16", fimOriginal: "2026-10-16", atrasadaInicio: true }),
      t({ id: "c", fim: "2026-10-14", fimOriginal: "2026-10-13" }),
      t({ id: "d", fim: "2026-10-12", atrasadaInicio: false }),
    ];
    const r = resumoAtrasos(lista);
    expect(r).toEqual({
      fimPrevisto: "2026-10-23",
      fimOriginal: "2026-10-19",
      diasUteis: 4,
      atrasadas: 3,
      porAvisar: 1,
      naoIniciadas: 1,
    });
    expect(tarefaAtrasada(lista[3])).toBe(false);
    expect(textoResumoAtrasos(r!)).toBe(
      "Fim previsto: 23 out (original 19 out, +4 dias úteis) · 3 tarefas atrasadas · 1 não iniciada a tempo · 1 por avisar o cliente"
    );
  });

  it("textoResumoAtrasos sem desvio e com adiantamento", () => {
    const base = { fimPrevisto: "2026-10-17", fimOriginal: "2026-10-17", diasUteis: 0, atrasadas: 0, porAvisar: 0, naoIniciadas: 0 };
    expect(textoResumoAtrasos(base)).toBe("Fim previsto: 17 out (no plano original) · sem tarefas atrasadas");
    expect(textoResumoAtrasos({ ...base, fimPrevisto: "2026-10-16", diasUteis: -1, atrasadas: 1 })).toBe(
      "Fim previsto: 16 out (original 17 out, −1 dia útil) · 1 tarefa atrasada"
    );
    expect(dataCurta("2026-10-23")).toBe("23 out");
  });
});
