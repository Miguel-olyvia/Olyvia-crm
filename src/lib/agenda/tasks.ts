/**
 * Tarefas pessoais no ecrã "O Meu Dia".
 *
 * Uma tarefa NÃO é um agendamento: não tem instante de início nem duração, tem
 * um PRAZO. Por isso não passa pelo `classifyAgendaItems`, que raciocina em
 * instantes.
 *
 * VERIFICADO CONTRA O REMOTO: `activities.due_date` NÃO é uma coluna `date` —
 * devolve `2026-09-04T00:00:00+00:00`, ou seja é um instante, e as linhas
 * existentes estão todas à meia-noite UTC. Trata-se aqui como o que na prática
 * é: uma data escrita como meia-noite UTC. A comparação é feita sobre TEXTO —
 * os primeiros dez caracteres do prazo contra o `YYYY-MM-DD` do dia local —
 * nunca convertendo o prazo para `Date`, que a ocidente de Greenwich o
 * empurraria um dia para trás.
 */
import { OVERDUE_LOOKBACK_DAYS, shiftDays } from "./dayWindow";

export interface TaskRow {
  id: string;
  title: string | null;
  description?: string | null;
  /** Chega como `YYYY-MM-DDT00:00:00+00:00`; só os dez primeiros caracteres interessam. */
  due_date: string | null;
  completed?: boolean | null;
  completed_at?: string | null;
}

export interface TaskSections<T extends TaskRow> {
  /** Por fazer, com prazo anterior ao dia visível. */
  overdue: T[];
  /** Prazo no dia visível — inclui as já concluídas, que ficam discretas. */
  today: T[];
}

/** Dia local em `YYYY-MM-DD`. `toISOString()` daria o dia em UTC, que às 23h de Lisboa no Verão já é o dia seguinte. */
export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Normaliza o que vem da base: com ou sem a parte da hora, fica `YYYY-MM-DD`. */
export function normalizeDueDate(dueDate: string | null | undefined): string | null {
  if (!dueDate) return null;
  const key = dueDate.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : null;
}

export function isTaskCompleted(row: TaskRow): boolean {
  return row.completed === true;
}

export interface TaskQueryRange {
  /** Limite inferior, inclusivo. */
  fromDate: string;
  /**
   * Limite superior EXCLUSIVO: é o dia seguinte ao visível.
   *
   * Tem de ser assim porque `due_date` é um instante, e não uma data: um
   * `lte` no próprio dia compararia contra a meia-noite desse dia e deixaria
   * de fora qualquer prazo que tivesse sido gravado com hora. Hoje não há
   * nenhum assim no remoto, mas basta uma tarefa criada por outro caminho
   * para a lista do dia perder linhas em silêncio.
   */
  untilDate: string;
}

/**
 * Intervalo de prazos a pedir à base: recua `lookbackDays` para apanhar as
 * atrasadas e termina no fim do dia visível. Mesmo desenho da agenda — uma
 * query só, em vez de uma para o dia e outra para os atrasos.
 */
export function getTaskQueryRange(
  day: Date,
  lookbackDays: number = OVERDUE_LOOKBACK_DAYS
): TaskQueryRange {
  return {
    fromDate: toDateKey(shiftDays(day, -Math.abs(lookbackDays))),
    untilDate: toDateKey(shiftDays(day, 1)),
  };
}

function byTitle(a: TaskRow, b: TaskRow): number {
  return String(a.title ?? "").localeCompare(String(b.title ?? ""));
}

/**
 * Reparte as tarefas entre "em atraso" e "do dia".
 *
 * Fica de fora o que não pertence a este dia: prazos futuros, prazos passados
 * já concluídos (isso é história) e tarefas sem prazo — o ecrã é uma vista de
 * um dia e o formulário de criação exige sempre um prazo, por isso uma tarefa
 * sem prazo não tem lugar nenhum onde aterrar aqui.
 */
export function classifyTasks<T extends TaskRow>(rows: readonly T[], day: Date): TaskSections<T> {
  const dayKey = toDateKey(day);

  const overdue: T[] = [];
  const today: T[] = [];

  for (const row of rows) {
    const dueKey = normalizeDueDate(row.due_date);
    if (!dueKey) continue;

    if (dueKey === dayKey) {
      today.push(row);
      continue;
    }
    if (dueKey < dayKey && !isTaskCompleted(row)) overdue.push(row);
  }

  overdue.sort((a, b) => {
    const diff = String(a.due_date ?? "").localeCompare(String(b.due_date ?? ""));
    return diff !== 0 ? diff : byTitle(a, b);
  });

  // As concluídas do dia continuam à vista, mas descem para o fim da lista:
  // quem abre o ecrã quer ver primeiro o que ainda tem por fazer.
  today.sort((a, b) => {
    const doneDiff = Number(isTaskCompleted(a)) - Number(isTaskCompleted(b));
    return doneDiff !== 0 ? doneDiff : byTitle(a, b);
  });

  return { overdue, today };
}
