/**
 * O resumo numérico do dia — a linha que responde, de relance, a "quanto tenho
 * pela frente".
 *
 * Vive fora dos componentes por duas razões: é a única parte do cabeçalho que
 * tem regras (o que conta como "por fazer", o que conta como "em atraso") e
 * essas regras têm de valer igual para as tarefas e para os agendamentos, que
 * chegam de tabelas diferentes e já vêm repartidos por secções distintas.
 */
import type { AgendaSections } from "./classify";
import type { AgendaItemRow } from "./types";
import { isTaskCompleted, type TaskRow, type TaskSections } from "./tasks";

export interface DaySummary {
  /** Tarefas do dia ainda por fechar. */
  todo: number;
  /** Tarefas do dia já concluídas — continuam à vista, contam para o progresso. */
  done: number;
  /** Agendamentos dentro do dia, com hora ou sem ela. */
  meetings: number;
  /** Tudo o que ficou para trás: tarefas e agendamentos por fechar. */
  overdue: number;
  /** Fracção concluída das tarefas do dia, entre 0 e 1. Sem tarefas, é 0. */
  progress: number;
}

export function buildDaySummary(
  tasks: TaskSections<TaskRow>,
  agenda: AgendaSections<AgendaItemRow>
): DaySummary {
  const done = tasks.today.filter(isTaskCompleted).length;
  const todo = tasks.today.length - done;
  const total = tasks.today.length;

  return {
    todo,
    done,
    meetings: agenda.timed.length + agenda.allDay.length,
    overdue: tasks.overdue.length + agenda.overdue.length,
    progress: total === 0 ? 0 : done / total,
  };
}
