import { describe, expect, it } from "vitest";
import {
  diasUteisDeDiferenca,
  fatorPara,
  rotuloRitmo,
  simularPlano,
  type Calendario,
  type TarefaPrevisao,
} from "../previsao";
import { diasUteisEntre } from "../obras";

// Outubro e novembro de 2026, com o feriado de 5/10 (segunda) tirado.
const DIAS = diasUteisEntre("2026-09-28", "2026-12-31").filter((d) => d !== "2026-10-05");
const cal = (hoje = "2026-10-01"): Calendario => ({ diasUteis: DIAS, hoje, minutosPorDia: 480 });

const tarefa = (p: Partial<TarefaPrevisao> & { id: string }): TarefaPrevisao => ({
  estado: "por_fazer",
  inicio: null,
  fim: null,
  minutosPrevistos: 480,
  minutosReais: 0,
  pessoas: 1,
  dependencias: [],
  ...p,
});

// Demolição 2 dias (6–7/10), Canalização 2 dias a seguir (8–9/10), Louças no
// dia seguinte (12/10, segunda).
const plano = (): TarefaPrevisao[] => [
  tarefa({ id: "a", inicio: "2026-10-06", fim: "2026-10-07", minutosPrevistos: 960, skillId: "dem" }),
  tarefa({ id: "b", inicio: "2026-10-08", fim: "2026-10-09", minutosPrevistos: 960, skillId: "can", dependencias: ["a"] }),
  tarefa({ id: "c", inicio: "2026-10-12", fim: "2026-10-12", minutosPrevistos: 480, skillId: "can", dependencias: ["b"] }),
];

describe("simularPlano", () => {
  it("ao ritmo previsto, sem cenário, devolve o próprio plano", () => {
    const r = simularPlano(plano(), () => 1, cal());
    expect(r.tarefas.get("a")).toEqual({ inicio: "2026-10-06", fim: "2026-10-07" });
    expect(r.tarefas.get("b")).toEqual({ inicio: "2026-10-08", fim: "2026-10-09" });
    expect(r.tarefas.get("c")).toEqual({ inicio: "2026-10-12", fim: "2026-10-12" });
    expect(r.fim).toBe("2026-10-12");
    expect(r.fimPlano).toBe("2026-10-12");
  });

  it("a 1,5× o previsto, as durações crescem e empurram as dependentes", () => {
    const r = simularPlano(plano(), () => 1.5, cal());
    expect(r.tarefas.get("a")).toEqual({ inicio: "2026-10-06", fim: "2026-10-08" }); // 3 dias
    expect(r.tarefas.get("b")).toEqual({ inicio: "2026-10-09", fim: "2026-10-13" }); // 3 dias, salta o fim de semana
    expect(r.tarefas.get("c")).toEqual({ inicio: "2026-10-14", fim: "2026-10-15" }); // 2 dias
    expect(r.fim).toBe("2026-10-15");
  });

  it("adiar o início salta feriados e fins de semana, e as feitas não mexem", () => {
    const t = plano();
    t[0] = { ...t[0], estado: "feita", minutosReais: 960 };
    const r = simularPlano(t, () => 1, cal(), { adiarDias: 2 });
    expect(r.tarefas.get("a")).toEqual({ inicio: "2026-10-06", fim: "2026-10-07" });
    expect(r.tarefas.get("b")!.inicio).toBe("2026-10-12");
    expect(r.fim).toBe("2026-10-14");
  });

  it("+1 pessoa numa especialidade encurta só as tarefas dela", () => {
    const r = simularPlano(plano(), () => 1, cal(), { maisUmaPessoaEm: "can" });
    expect(r.tarefas.get("a")).toEqual({ inicio: "2026-10-06", fim: "2026-10-07" });
    expect(r.tarefas.get("b")).toEqual({ inicio: "2026-10-08", fim: "2026-10-08" }); // 2 → 1 dia
    // A Louças começava no dia útil seguinte ao fim da Canalização; continua.
    expect(r.tarefas.get("c")).toEqual({ inicio: "2026-10-09", fim: "2026-10-09" });
  });

  it("uma tarefa +100 % empurra o fim", () => {
    const r = simularPlano(plano(), () => 1, cal(), { tarefaMaisLonga: { id: "a", percentagem: 100 } });
    expect(r.tarefas.get("a")!.fim).toBe("2026-10-09"); // 4 dias
    expect(r.tarefas.get("b")).toEqual({ inicio: "2026-10-12", fim: "2026-10-13" });
    expect(r.fim).toBe("2026-10-14");
  });

  it("o que está atrasado não começa antes de hoje; a em curso continua com o que falta", () => {
    const t = plano();
    t[0] = { ...t[0], estado: "em_curso", minutosReais: 480 };
    const r = simularPlano(t, () => 1, cal("2026-10-08"));
    expect(r.tarefas.get("a")).toEqual({ inicio: "2026-10-08", fim: "2026-10-08" }); // falta 1 dia
    expect(r.tarefas.get("b")!.inicio).toBe("2026-10-09");
  });

  it("um ciclo nas dependências não rebenta", () => {
    const t = [
      tarefa({ id: "x", inicio: "2026-10-06", fim: "2026-10-06", dependencias: ["y"] }),
      tarefa({ id: "y", inicio: "2026-10-07", fim: "2026-10-07", dependencias: ["x"] }),
    ];
    const r = simularPlano(t, () => 1, cal());
    expect(r.tarefas.size).toBe(2);
  });
});

describe("fatorPara", () => {
  const f = { p50: 1.2, p80: 1.5, fonte: "historico" as const, porEspecialidade: new Map([["can", { p50: 2, p80: 3 }]]) };
  it("usa a especialidade quando há histórico", () => {
    expect(fatorPara(f, "p50")(tarefa({ id: "1", skillId: "can" }))).toBe(2);
    expect(fatorPara(f, "p80")(tarefa({ id: "1", skillId: "dem" }))).toBe(1.5);
  });
  it("com ritmo da própria obra, ignora as especialidades", () => {
    expect(fatorPara({ ...f, fonte: "obra" }, "p50")(tarefa({ id: "1", skillId: "can" }))).toBe(1.2);
  });
});

describe("auxiliares", () => {
  it("conta dias úteis de diferença, com o feriado", () => {
    expect(diasUteisDeDiferenca("2026-10-02", "2026-10-07", cal())).toBe(2); // 6 e 7 (5 é feriado)
    expect(diasUteisDeDiferenca("2026-10-07", "2026-10-02", cal())).toBe(-2);
    expect(diasUteisDeDiferenca("2026-10-07", "2026-10-07", cal())).toBe(0);
  });
  it("rótulo do ritmo", () => {
    expect(rotuloRitmo(1)).toBe("o previsto");
    expect(rotuloRitmo(1.5)).toBe("1,5× o previsto");
    expect(rotuloRitmo(1.25)).toBe("1,25× o previsto");
  });
});
