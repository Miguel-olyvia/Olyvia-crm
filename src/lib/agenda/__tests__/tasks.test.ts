/**
 * A repartição das tarefas pelo dia visível.
 *
 * O que aqui se protege é a diferença entre uma tarefa e um agendamento: o
 * prazo é uma DATA (`YYYY-MM-DD`), não um instante, e a comparação é feita como
 * texto contra o dia local — nunca convertendo o prazo para `Date`, que o
 * empurraria um dia para trás a ocidente de Greenwich.
 */
import { describe, it, expect } from "vitest";
import { classifyTasks, getTaskQueryRange, normalizeDueDate, toDateKey, type TaskRow } from "../tasks";

const day = new Date(2026, 8, 4); // 4 de Setembro de 2026, hora local

function task(partial: Partial<TaskRow> & { id: string }): TaskRow {
  return {
    title: partial.id,
    description: null,
    due_date: null,
    completed: false,
    completed_at: null,
    ...partial,
  };
}

describe("toDateKey", () => {
  it("dá o dia LOCAL, e não o dia em UTC", () => {
    // 23:30 local de 4 de Setembro. Em UTC+2 isto já é dia 5 em UTC, e
    // `toISOString().slice(0,10)` diria "2026-09-05".
    expect(toDateKey(new Date(2026, 8, 4, 23, 30))).toBe("2026-09-04");
    expect(toDateKey(new Date(2026, 0, 1))).toBe("2026-01-01");
  });
});

describe("normalizeDueDate", () => {
  it("aceita `YYYY-MM-DD` e corta o que vier a mais", () => {
    expect(normalizeDueDate("2026-09-04")).toBe("2026-09-04");
    expect(normalizeDueDate("2026-09-04T00:00:00+00:00")).toBe("2026-09-04");
  });

  it("devolve null para ausência ou lixo", () => {
    expect(normalizeDueDate(null)).toBeNull();
    expect(normalizeDueDate("")).toBeNull();
    expect(normalizeDueDate("amanhã")).toBeNull();
  });
});

describe("classifyTasks", () => {
  it("põe a tarefa com prazo no dia visível na secção do dia", () => {
    const { today, overdue } = classifyTasks([task({ id: "a", due_date: "2026-09-04" })], day);
    expect(today.map((row) => row.id)).toEqual(["a"]);
    expect(overdue).toHaveLength(0);
  });

  it("mantém à vista a tarefa do dia já concluída, mas depois das que faltam", () => {
    const { today } = classifyTasks(
      [
        task({ id: "feita", due_date: "2026-09-04", completed: true, completed_at: "2026-09-04T09:00:00Z" }),
        task({ id: "por-fazer", due_date: "2026-09-04" }),
      ],
      day
    );
    expect(today.map((row) => row.id)).toEqual(["por-fazer", "feita"]);
  });

  it("manda para atraso a tarefa por fazer com prazo anterior ao dia visível", () => {
    const { overdue, today } = classifyTasks(
      [
        task({ id: "antiga", due_date: "2026-08-30" }),
        task({ id: "anteontem", due_date: "2026-09-02" }),
      ],
      day
    );
    expect(overdue.map((row) => row.id)).toEqual(["antiga", "anteontem"]);
    expect(today).toHaveLength(0);
  });

  it("não trata como atraso a tarefa antiga já concluída — isso é história", () => {
    const { overdue } = classifyTasks(
      [task({ id: "fechada", due_date: "2026-09-01", completed: true })],
      day
    );
    expect(overdue).toHaveLength(0);
  });

  it("ignora prazos futuros e tarefas sem prazo", () => {
    const { overdue, today } = classifyTasks(
      [task({ id: "amanha", due_date: "2026-09-05" }), task({ id: "sem-prazo", due_date: null })],
      day
    );
    expect(overdue).toHaveLength(0);
    expect(today).toHaveLength(0);
  });
});

describe("getTaskQueryRange", () => {
  it("recua o número de dias pedido e termina no dia SEGUINTE, exclusivo", () => {
    // O limite superior é o dia a seguir porque `due_date` é um instante no
    // remoto (`2026-09-04T00:00:00+00:00`): parar no próprio dia cortaria
    // qualquer prazo gravado com hora.
    expect(getTaskQueryRange(day, 30)).toEqual({ fromDate: "2026-08-05", untilDate: "2026-09-05" });
  });
});

describe("prazos como vêm do remoto", () => {
  it("classifica pelo dia do texto, sem converter o instante", () => {
    const { today, overdue } = classifyTasks(
      [
        task({ id: "hoje", due_date: "2026-09-04T00:00:00+00:00" }),
        task({ id: "atrasada", due_date: "2026-09-01T00:00:00+00:00" }),
      ],
      day
    );
    expect(today.map((row) => row.id)).toEqual(["hoje"]);
    expect(overdue.map((row) => row.id)).toEqual(["atrasada"]);
  });

  it("um prazo gravado com hora continua a pertencer ao seu dia", () => {
    const { today } = classifyTasks([task({ id: "tarde", due_date: "2026-09-04T17:30:00+00:00" })], day);
    expect(today.map((row) => row.id)).toEqual(["tarde"]);
  });
});
