import { describe, it, expect } from "vitest";
import { buildDaySummary } from "../summary";
import type { AgendaSections } from "../classify";
import type { AgendaItemRow } from "../types";
import type { TaskRow, TaskSections } from "../tasks";

function task(id: string, completed = false): TaskRow {
  return { id, title: id, description: null, due_date: "2026-09-04", completed, completed_at: null };
}

function item(id: string): AgendaItemRow {
  return {
    id,
    title: id,
    status: "scheduled",
    start_datetime: "2026-09-04T09:00:00Z",
    end_datetime: "2026-09-04T10:00:00Z",
  };
}

const noTasks: TaskSections<TaskRow> = { overdue: [], today: [] };
const noAgenda: AgendaSections<AgendaItemRow> = { overdue: [], timed: [], allDay: [] };

describe("buildDaySummary", () => {
  it("separa o que falta do que já está feito", () => {
    const summary = buildDaySummary(
      { overdue: [], today: [task("a"), task("b", true), task("c")] },
      noAgenda
    );
    expect(summary.todo).toBe(2);
    expect(summary.done).toBe(1);
    expect(summary.progress).toBeCloseTo(1 / 3);
  });

  it("conta como reuniões do dia tanto as marcadas com hora como as sem hora", () => {
    const summary = buildDaySummary(noTasks, {
      overdue: [],
      timed: [item("t1"), item("t2")],
      allDay: [item("d1")],
    });
    expect(summary.meetings).toBe(3);
  });

  it("junta num só número o atraso das tarefas e o dos agendamentos", () => {
    const summary = buildDaySummary(
      { overdue: [task("velha")], today: [] },
      { overdue: [item("falhada"), item("outra")], timed: [], allDay: [] }
    );
    expect(summary.overdue).toBe(3);
  });

  it("não divide por zero num dia sem tarefas nenhumas", () => {
    const summary = buildDaySummary(noTasks, noAgenda);
    expect(summary).toEqual({ todo: 0, done: 0, meetings: 0, overdue: 0, progress: 0 });
  });

  it("dá progresso completo quando tudo o que havia para hoje está fechado", () => {
    const summary = buildDaySummary({ overdue: [], today: [task("a", true)] }, noAgenda);
    expect(summary.progress).toBe(1);
    expect(summary.todo).toBe(0);
  });

  it("o atraso não conta para o progresso do dia — é dívida de outro dia", () => {
    const summary = buildDaySummary({ overdue: [task("velha")], today: [task("a", true)] }, noAgenda);
    expect(summary.progress).toBe(1);
    expect(summary.overdue).toBe(1);
  });
});
