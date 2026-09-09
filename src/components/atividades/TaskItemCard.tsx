import { Check, CalendarX2 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { isTaskCompleted, type TaskRow } from "@/lib/agenda/tasks";

interface TaskItemCardProps {
  task: TaskRow;
  onToggle: (id: string, completed: boolean) => void;
  disabled?: boolean;
  /** Nos atrasados mostra-se também o prazo, que já não é o dia visível. */
  formatDate?: (dueDate: string) => string;
  variant?: "default" | "overdue";
}

/**
 * Uma tarefa, como linha de uma lista de conferir.
 *
 * Deliberadamente NÃO é um cartão: o agendamento é que tem cartão, ancorado à
 * sua hora numa linha do tempo. A tarefa não tem hora nenhuma — tem um gesto,
 * riscá-la. Por isso a sua forma é a de uma lista: sem moldura própria, com a
 * caixa de conferir a abrir a linha e o título a ocupar tudo o resto. As duas
 * naturezas ficam distinguíveis sem se ler uma única palavra.
 *
 * O alvo de toque da caixa tem 44px, muito acima do mínimo da WCAG 2.2 (24px):
 * este é o gesto que um comercial faz de pé, no telemóvel, entre visitas.
 */
export function TaskItemCard({
  task,
  onToggle,
  disabled = false,
  formatDate,
  variant = "default",
}: TaskItemCardProps) {
  const { t } = useTranslation();
  const completed = isTaskCompleted(task);
  const isOverdue = variant === "overdue" && !completed;
  const title = task.title?.trim() || t("activities.myDay.untitled");

  return (
    <li className="group relative">
      {/* Marca do lado esquerdo: discreta em repouso, acende ao passar o rato —
          e permanente a vermelho quando a tarefa já devia estar fechada. */}
      <span
        aria-hidden="true"
        className={`absolute inset-y-2 left-0 w-[3px] rounded-full transition-all duration-200 ${
          isOverdue
            ? "bg-destructive/70"
            : completed
              ? "bg-transparent"
              : "bg-primary/0 group-hover:bg-primary/60"
        }`}
      />

      <div
        className={`flex items-start gap-2 rounded-xl py-1 pl-2.5 pr-2 transition-colors duration-200 ${
          completed ? "hover:bg-muted/40" : "hover:bg-muted/60"
        }`}
      >
        <button
          type="button"
          role="checkbox"
          aria-checked={completed}
          aria-label={completed ? t("activities.myDay.reopenTask") : t("activities.myDay.completeTask")}
          disabled={disabled}
          onClick={() => onToggle(task.id, !completed)}
          className="-ml-1 grid h-11 w-11 shrink-0 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span
            className={`grid h-[1.35rem] w-[1.35rem] place-items-center rounded-md border-2 transition-all duration-200 ${
              completed
                ? "border-success bg-success text-success-foreground"
                : isOverdue
                  ? "border-destructive/60 group-hover:border-destructive"
                  : "border-muted-foreground/40 group-hover:border-primary group-hover:bg-primary/5"
            }`}
          >
            <Check
              className={`h-3.5 w-3.5 transition-transform duration-200 ${
                completed ? "scale-100" : "scale-0"
              }`}
              strokeWidth={3}
            />
          </span>
        </button>

        <div className="min-w-0 flex-1 py-2 pr-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span
              className={`text-[0.9375rem] leading-snug transition-colors duration-200 ${
                completed
                  ? "text-muted-foreground line-through decoration-muted-foreground/50"
                  : "font-medium text-foreground"
              }`}
            >
              {title}
            </span>

            {isOverdue && formatDate && task.due_date && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium tabular-nums text-destructive">
                <CalendarX2 className="h-3 w-3" aria-hidden="true" />
                {t("activities.myDay.taskDue", { date: formatDate(task.due_date) })}
              </span>
            )}
          </div>

          {task.description && (
            <p
              className={`mt-0.5 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground ${
                completed ? "opacity-60" : ""
              }`}
            >
              {task.description}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}
