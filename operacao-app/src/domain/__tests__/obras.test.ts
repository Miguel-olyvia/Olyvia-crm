import { describe, expect, it } from "vitest";
import {
  acoesDoExecutor,
  choquesEntreObras,
  diaDaSemana,
  diasUteisEntre,
  distanciaUteis,
  ehDiaUtil,
  formatarCronometro,
  formatarMinutos,
  hojeIso,
  minutosReais,
  moverIntervalo,
  nivelDeAlerta,
  percentagemGasta,
  planearSequencial,
  podeDecidirExtras,
  podePlanear,
  podeValidar,
  precisaJustificacao,
  redimensionarIntervalo,
  sobrecargas,
  somarDiasUteis,
  totaisDaFase,
  validarJustificacao,
  type Atribuicao,
  type TarefaResumo,
} from "../obras";

// Outubro de 2026: dia 5 é segunda, 10 e 11 são fim de semana.
describe("dias úteis", () => {
  it("sabe o dia da semana", () => {
    expect(diaDaSemana("2026-10-05")).toBe(1);
    expect(diaDaSemana("2026-10-10")).toBe(6);
    expect(diaDaSemana("2026-10-11")).toBe(7);
    expect(ehDiaUtil("2026-10-09")).toBe(true);
    expect(ehDiaUtil("2026-10-10")).toBe(false);
  });

  it("somar 0 dias úteis a um sábado dá segunda", () => {
    expect(somarDiasUteis("2026-10-10", 0)).toBe("2026-10-12");
    expect(somarDiasUteis("2026-10-07", 0)).toBe("2026-10-07");
  });

  it("salta o fim de semana para a frente e para trás", () => {
    expect(somarDiasUteis("2026-10-09", 1)).toBe("2026-10-12");
    expect(somarDiasUteis("2026-10-05", 6)).toBe("2026-10-13");
    expect(somarDiasUteis("2026-10-12", -1)).toBe("2026-10-09");
    expect(somarDiasUteis("2026-10-11", -1)).toBe("2026-10-08");
  });

  it("atravessa meses e anos sem trocar o dia (sem fuso)", () => {
    expect(somarDiasUteis("2026-10-30", 1)).toBe("2026-11-02");
    expect(somarDiasUteis("2026-12-31", 1)).toBe("2027-01-01");
    // Mudança de hora em Portugal: 25/10/2026.
    expect(somarDiasUteis("2026-10-23", 1)).toBe("2026-10-26");
  });

  it("lista os dias úteis entre duas datas, inclusive", () => {
    expect(diasUteisEntre("2026-10-08", "2026-10-13")).toEqual([
      "2026-10-08", "2026-10-09", "2026-10-12", "2026-10-13",
    ]);
    expect(diasUteisEntre("2026-10-13", "2026-10-08")).toEqual([]);
  });

  it("mede a distância em dias úteis, com sinal", () => {
    expect(distanciaUteis("2026-10-05", "2026-10-05")).toBe(0);
    expect(distanciaUteis("2026-10-09", "2026-10-12")).toBe(1);
    expect(distanciaUteis("2026-10-12", "2026-10-09")).toBe(-1);
    expect(distanciaUteis("2026-10-05", "2026-10-13")).toBe(6);
  });

  it("hoje em texto, no fuso local", () => {
    expect(hojeIso(new Date(2026, 9, 7, 23, 59))).toBe("2026-10-07");
  });
});

describe("planear em sequência (espelho de ops_obra_replanear_impl)", () => {
  it("o exemplo da casa de banho: 3045 min a 480/dia acabam ao 7.º dia útil", () => {
    const minutos = [60, 90, 300, 120, 360, 240, 120, 60, 240, 300, 420, 120, 120, 240, 120, 90, 45];
    const tarefas = minutos.map((m, i) => ({ id: `t${i}`, minutos: m }));
    const p = planearSequencial(tarefas, "2026-10-05");
    expect(p.get("t0")).toEqual({ inicio: "2026-10-05", fim: "2026-10-05" });
    // 60+90+300 = 450; a 4.ª (120) começa a 450 e acaba a 569 → segunda-feira e terça.
    expect(p.get("t3")).toEqual({ inicio: "2026-10-05", fim: "2026-10-06" });
    expect(p.get("t16")!.fim).toBe("2026-10-13");
    for (const i of p.values()) {
      expect(ehDiaUtil(i.inicio)).toBe(true);
      expect(ehDiaUtil(i.fim)).toBe(true);
    }
  });

  it("uma tarefa maior que um dia ocupa vários", () => {
    const p = planearSequencial([{ id: "a", minutos: 1000 }], "2026-10-08");
    expect(p.get("a")).toEqual({ inicio: "2026-10-08", fim: "2026-10-12" });
  });

  it("com 2 pessoas, no calendário dura metade (como ops_obra_replanear_impl)", () => {
    const p = planearSequencial(
      [
        { id: "a", minutos: 600, pessoas: 2 },
        { id: "b", minutos: 180 },
        { id: "c", minutos: 60 },
      ],
      "2026-10-12"
    );
    expect(p.get("a")).toEqual({ inicio: "2026-10-12", fim: "2026-10-12" });
    expect(p.get("b")).toEqual({ inicio: "2026-10-12", fim: "2026-10-12" });
    expect(p.get("c")).toEqual({ inicio: "2026-10-13", fim: "2026-10-13" });
  });

  it("respeita outra capacidade diária", () => {
    const p = planearSequencial([{ id: "a", minutos: 240 }, { id: "b", minutos: 240 }], "2026-10-05", 240);
    expect(p.get("b")).toEqual({ inicio: "2026-10-06", fim: "2026-10-06" });
  });
});

describe("arrastar e esticar no Gantt", () => {
  it("mover mantém a duração em dias úteis", () => {
    expect(moverIntervalo({ inicio: "2026-10-08", fim: "2026-10-09" }, 1)).toEqual({
      inicio: "2026-10-09",
      fim: "2026-10-12",
    });
    expect(moverIntervalo({ inicio: "2026-10-12", fim: "2026-10-12" }, -1)).toEqual({
      inicio: "2026-10-09",
      fim: "2026-10-09",
    });
  });

  it("esticar não deixa acabar antes de começar", () => {
    expect(redimensionarIntervalo({ inicio: "2026-10-08", fim: "2026-10-09" }, 2)).toEqual({
      inicio: "2026-10-08",
      fim: "2026-10-13",
    });
    expect(redimensionarIntervalo({ inicio: "2026-10-08", fim: "2026-10-09" }, -5)).toEqual({
      inicio: "2026-10-08",
      fim: "2026-10-08",
    });
  });
});

describe("totais da fase", () => {
  const t = (p: Partial<TarefaResumo>): TarefaResumo => ({
    id: "x", faseId: "f", estado: "por_fazer", minutosPrevistos: 60, minutosReais: 0,
    inicio: null, fim: null, ...p,
  });

  it("a duração da fase é a soma das tarefas, e a barra vai do 1.º início ao último fim", () => {
    const r = totaisDaFase([
      t({ minutosPrevistos: 60, minutosReais: 70, inicio: "2026-10-06", fim: "2026-10-06", estado: "validada" }),
      t({ minutosPrevistos: 300, minutosReais: 12.34, inicio: "2026-10-05", fim: "2026-10-07", estado: "feita" }),
      t({ minutosPrevistos: 120, inicio: "2026-10-08", fim: null }),
      t({ minutosPrevistos: 30 }),
    ]);
    expect(r.minutosPrevistos).toBe(510);
    expect(r.minutosReais).toBe(82.3);
    expect(r.inicio).toBe("2026-10-05");
    expect(r.fim).toBe("2026-10-08");
    expect(r.nFeitas).toBe(2);
    expect(r.nValidadas).toBe(1);
    expect(r.progresso).toBe(50);
  });

  it("fase vazia não rebenta", () => {
    expect(totaisDaFase([])).toMatchObject({ minutosPrevistos: 0, inicio: null, progresso: 0 });
  });
});

describe("alertas e desvio", () => {
  it("aviso a partir de 80 %, excedido acima de 100 %", () => {
    expect(nivelDeAlerta(47, 60)).toBe("ok");
    expect(nivelDeAlerta(48, 60)).toBe("aviso");
    expect(nivelDeAlerta(60, 60)).toBe("aviso");
    expect(nivelDeAlerta(60.1, 60)).toBe("excedido");
    expect(nivelDeAlerta(0, 0)).toBe("ok");
    expect(nivelDeAlerta(1, 0)).toBe("excedido");
  });

  it("percentagem gasta", () => {
    expect(percentagemGasta(45, 60)).toBe(75);
    expect(percentagemGasta(90, 60)).toBe(150);
    expect(percentagemGasta(0, 0)).toBe(0);
  });

  it("justificação só acima do previsto + tolerância (espelho do SQL)", () => {
    expect(precisaJustificacao(66, 60, 10)).toBe(false);
    expect(precisaJustificacao(66.1, 60, 10)).toBe(true);
    expect(precisaJustificacao(95, 90, 10)).toBe(false);
    expect(precisaJustificacao(61, 60, 0)).toBe(true);
  });

  it("valida a justificação: motivo da lista; 'outro' exige nota", () => {
    expect(validarJustificacao({ motivo: "", nota: "" }, true)).toMatch(/motivo/);
    expect(validarJustificacao({ motivo: "", nota: "" }, false)).toBeNull();
    expect(validarJustificacao({ motivo: "secagem", nota: "" }, true)).toBeNull();
    expect(validarJustificacao({ motivo: "outro", nota: "  " }, true)).toMatch(/nota/);
    expect(validarJustificacao({ motivo: "outro", nota: "Chuva" }, true)).toBeNull();
    expect(validarJustificacao({ motivo: "preguica" as never, nota: "" }, true)).toMatch(/desconhecido/);
  });

  it("minutos reais somam pessoas; um registo aberto conta até agora", () => {
    const agora = new Date("2026-10-07T12:00:00Z");
    expect(
      minutosReais(
        [
          { utilizadorId: "a", tarefaId: "t", inicio: "2026-10-07T10:00:00Z", fim: "2026-10-07T11:00:00Z" },
          { utilizadorId: "b", tarefaId: "t", inicio: "2026-10-07T11:30:00Z", fim: null },
          { utilizadorId: "c", tarefaId: "t", inicio: "2026-10-07T13:00:00Z", fim: null },
        ],
        agora
      )
    ).toBe(90);
  });
});

describe("formatação", () => {
  it("minutos em horas legíveis", () => {
    expect(formatarMinutos(45)).toBe("45 min");
    expect(formatarMinutos(120)).toBe("2 h");
    expect(formatarMinutos(90.4)).toBe("1 h 30 min");
    expect(formatarMinutos(-30)).toBe("−30 min");
    expect(formatarMinutos(null)).toBe("—");
  });

  it("cronómetro", () => {
    expect(formatarCronometro(65)).toBe("1:05");
    expect(formatarCronometro(3909)).toBe("1:05:09");
    expect(formatarCronometro(-3)).toBe("0:00");
  });
});

describe("perfis e botões", () => {
  it("quem planeia, valida e decide", () => {
    expect(podePlanear("gestor")).toBe(true);
    expect(podePlanear("supervisor")).toBe(false);
    expect(podePlanear("tecnico")).toBe(false);
    expect(podeValidar("supervisor")).toBe(true);
    expect(podeValidar("tecnico")).toBe(false);
    expect(podeValidar("operador")).toBe(false);
    expect(podeDecidirExtras("admin")).toBe(true);
    expect(podeDecidirExtras(null)).toBe(false);
  });

  const base = {
    estado: "por_fazer" as const,
    obraEstado: "em_curso" as const,
    aCorrerAqui: false,
    aCorrerNoutra: false,
    dependenciaPorFazer: false,
  };

  it("por fazer: só iniciar", () => {
    expect(acoesDoExecutor(base)).toEqual({ acoes: ["iniciar"], bloqueio: null });
  });
  it("a correr aqui: pausar ou concluir", () => {
    expect(acoesDoExecutor({ ...base, estado: "em_curso", aCorrerAqui: true }).acoes).toEqual(["pausar", "concluir"]);
  });
  it("em curso por outro: juntar-se ou concluir", () => {
    expect(acoesDoExecutor({ ...base, estado: "em_curso" }).acoes).toEqual(["iniciar", "concluir"]);
  });
  it("bloqueios com o porquê", () => {
    expect(acoesDoExecutor({ ...base, aCorrerNoutra: true }).bloqueio).toMatch(/outra tarefa/);
    expect(acoesDoExecutor({ ...base, dependenciaPorFazer: true }).bloqueio).toMatch(/Depende/);
    expect(acoesDoExecutor({ ...base, obraEstado: "suspensa" }).bloqueio).toMatch(/não está em curso/);
    expect(acoesDoExecutor({ ...base, estado: "feita" }).bloqueio).toMatch(/validação/);
  });
  it("rejeitada volta a poder ser iniciada", () => {
    expect(acoesDoExecutor({ ...base, estado: "rejeitada" }).acoes).toEqual(["iniciar"]);
  });
});

describe("choques de agenda", () => {
  const a = (p: Partial<Atribuicao>): Atribuicao => ({
    tarefaId: "t", obraId: "o1", utilizadorId: "u", inicio: "2026-10-05", fim: "2026-10-05",
    minutos: 60, estado: "por_fazer", ...p,
  });

  it("a mesma pessoa em duas obras no mesmo dia choca; na mesma obra não", () => {
    const c = choquesEntreObras([
      a({ tarefaId: "t1", obraId: "o1" }),
      a({ tarefaId: "t2", obraId: "o1" }),
      a({ tarefaId: "t3", obraId: "o2", inicio: "2026-10-05", fim: "2026-10-06" }),
      a({ tarefaId: "t4", obraId: "o3", inicio: "2026-10-07", fim: "2026-10-07" }),
    ]);
    const pares = c.map((x) => `${x.tarefaId}>${x.outraTarefaId}`).sort();
    expect(pares).toEqual(["t1>t3", "t2>t3", "t3>t1", "t3>t2"]);
  });

  it("tarefas feitas ou sem data não chocam", () => {
    expect(
      choquesEntreObras([
        a({ tarefaId: "t1", obraId: "o1", estado: "feita" }),
        a({ tarefaId: "t2", obraId: "o2" }),
        a({ tarefaId: "t3", obraId: "o3", inicio: null, fim: null }),
      ])
    ).toEqual([]);
  });

  it("sobrecarga: mais de 8 h planeadas no mesmo dia", () => {
    const s = sobrecargas([
      a({ tarefaId: "t1", minutos: 300 }),
      a({ tarefaId: "t2", minutos: 240 }),
      a({ tarefaId: "t3", minutos: 960, inicio: "2026-10-06", fim: "2026-10-07" }),
      a({ tarefaId: "t4", utilizadorId: "v", minutos: 480 }),
    ]);
    expect(s).toEqual([{ utilizadorId: "u", dia: "2026-10-05", minutos: 540 }]);
  });
});
