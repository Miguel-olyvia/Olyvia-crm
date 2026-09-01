import type { DayWindow } from "./dayWindow";
import { TERMINAL_STATUSES, type AgendaItemRow } from "./types";

/**
 * Reparte os itens pelas três secções da página, tudo a partir de
 * `start_datetime` (o instante que marca o item no dia) e do estado.
 */
export interface AgendaSections<T extends AgendaItemRow> {
  /** Antes do dia visível e ainda por fechar. Vai primeiro, em destaque. */
  overdue: T[];
  /** Dentro do dia visível, com hora. */
  timed: T[];
  /** Dentro do dia visível, marcados `all_day`. */
  allDay: T[];
}

export function isTerminalStatus(status: string | null | undefined): boolean {
  return TERMINAL_STATUSES.has(String(status ?? ""));
}

function startInstant(row: AgendaItemRow): number {
  const value = new Date(row.start_datetime).getTime();
  return Number.isNaN(value) ? Number.POSITIVE_INFINITY : value;
}

function byStartAscending(a: AgendaItemRow, b: AgendaItemRow): number {
  const diff = startInstant(a) - startInstant(b);
  // Desempate estável pelo título, para a ordem não depender da ordem da query.
  if (diff !== 0) return diff;
  return String(a.title ?? "").localeCompare(String(b.title ?? ""));
}

export function classifyAgendaItems<T extends AgendaItemRow>(
  rows: readonly T[],
  window: DayWindow
): AgendaSections<T> {
  const windowStart = window.start.getTime();
  const windowEnd = window.end.getTime();

  const overdue: T[] = [];
  const timed: T[] = [];
  const allDay: T[] = [];

  for (const row of rows) {
    const start = startInstant(row);
    if (!Number.isFinite(start)) continue;

    if (start < windowStart) {
      // Só é "atrasado" o que continua por fechar: concluído ou cancelado é
      // história, não trabalho pendente.
      if (!isTerminalStatus(row.status)) overdue.push(row);
      continue;
    }
    if (start > windowEnd) continue;

    if (row.all_day === true) allDay.push(row);
    else timed.push(row);
  }

  overdue.sort(byStartAscending);
  timed.sort(byStartAscending);
  allDay.sort((a, b) => String(a.title ?? "").localeCompare(String(b.title ?? "")));

  return { overdue, timed, allDay };
}
